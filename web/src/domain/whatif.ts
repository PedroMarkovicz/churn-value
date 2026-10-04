/**
 * The what-if (spec §5.4, item 7): edit what we know about a customer, check that the edits could
 * describe a real purchase history, rebuild the model's input exactly as the pipeline does
 * (derived features golden-tested, context from feature_spec) and price the new answer.
 */
import type { FeatureSpec } from "@/contract/index.ts";
import type { Scenario } from "@/scenario/schema.ts";

import { type BaseFeatures, derivedFeatures } from "./derived.ts";
import {
  breakEvenProbability,
  customerEconomics,
  expectedProfit,
  valueAtRisk,
} from "./economics.ts";
import { count, money, moneyPrecise } from "./format.ts";
import { expectedAov } from "./gammaGamma.ts";

/** A customer's base features, by name. */
export type Values = Readonly<Record<string, number>>;

/** spend_90d, purchases_90d: the recent window is 90 days; spend_prev_90d covers the 90 before. */
const WINDOW_DAYS = 90;
const PENNY = 0.01;

/**
 * Spend per purchase day is total spend / purchase days for every holdout customer, so the
 * what-if derives it rather than offering a field that could contradict the other two.
 */
const COMPUTED = new Set(["avg_order_value"]);

export type FieldGroup = "recent" | "history";

export interface Field {
  name: string;
  label: string;
  group: FieldGroup;
  unit: string;
  integer: boolean;
  flag: boolean; // a yes/no feature, edited with a checkbox
  min: number;
  max: number;
}

/** Plain labels, in the order the drawer shows them. A new feature falls back to its description. */
const COPY: Record<string, { label: string; group: FieldGroup }> = {
  recency_days: { label: "Days since last purchase", group: "recent" },
  purchases_90d: { label: "Purchase days in the last 90 days", group: "recent" },
  spend_90d: { label: "Spend in the last 90 days (£)", group: "recent" },
  spend_prev_90d: { label: "Spend in the 90 days before those (£)", group: "recent" },
  n_purchase_days: { label: "Purchase days in total", group: "history" },
  tenure_days: { label: "Days since first purchase", group: "history" },
  total_spend: { label: "Total spend (£)", group: "history" },
  n_distinct_products: { label: "Different products bought", group: "history" },
  cadence_cv: { label: "Unevenness of the gaps between purchases (0 = even)", group: "history" },
  return_rate: { label: "Share of spend returned (0 to 1)", group: "history" },
  bought_same_window_last_year: { label: "Bought in this season last year", group: "history" },
  is_uk: { label: "Based in the United Kingdom", group: "history" },
};
const ORDER = Object.keys(COPY);

export function editableFields(spec: FeatureSpec): Field[] {
  const position = (name: string) => {
    const i = ORDER.indexOf(name);
    return i < 0 ? ORDER.length : i;
  };
  return spec.features
    .filter((f) => f.editable && !COMPUTED.has(f.name))
    .map((f): Field => ({
      name: f.name,
      label: COPY[f.name]?.label ?? f.description,
      group: COPY[f.name]?.group ?? "history",
      unit: f.unit,
      integer: f.dtype === "int",
      flag: f.dtype === "int" && f.min === 0 && f.max === 1,
      min: f.min,
      max: f.max,
    }))
    .sort((a, b) => position(a.name) - position(b.name));
}

export function baseValues(
  features: Readonly<Record<string, number>>,
  spec: FeatureSpec,
): Record<string, number> {
  return Object.fromEntries(
    spec.features
      .filter((f) => f.group === "base")
      .map((f) => [f.name, features[f.name] ?? Number.NaN]),
  );
}

export function formatValue(
  field: Pick<Field, "unit" | "integer" | "flag">,
  value: number,
): string {
  if (field.flag) return value >= 1 ? "yes" : "no";
  if (field.unit === "£") return money(value);
  if (field.integer) return count(value);
  return String(Math.round(value * 100) / 100);
}

/** A value as the field shows it: pounds to the penny, ratios to three decimals, counts whole. */
export function draftText(field: Pick<Field, "unit" | "integer">, value: number): string {
  if (field.integer) return String(value);
  if (field.unit === "£") return String(Math.round(value * 100) / 100);
  return String(Number(value.toFixed(3)));
}

/**
 * A typed amount as a number. "£500", "1,250" and " 12.5 " are read; anything else is NaN, so
 * the field says "Enter a number." instead of using a number the customer did not type.
 */
export function parseDraft(text: string): number {
  const typed = text.trim().replace(/^£\s*/, "");
  const plain = /^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(typed) ? typed.replaceAll(",", "") : typed;
  return /^-?(\d+\.?\d*|\.\d+)$/.test(plain) ? Number(plain) : Number.NaN;
}

/** A range limit as text the field accepts: rounded inward, at the precision the field shows. */
export function limitText(
  field: Pick<Field, "unit" | "integer" | "flag" | "min" | "max">,
  side: "min" | "max",
): string {
  if (field.flag) return side === "min" ? "no" : "yes";
  const scale = 10 ** (field.integer ? 0 : field.unit === "£" ? 2 : 3);
  // the small shift keeps 24.35 * 100 = 2435.0000000000005 from rounding up to 24.36
  const value =
    side === "min"
      ? Math.ceil(field.min * scale - 1e-9) / scale
      : Math.floor(field.max * scale + 1e-9) / scale;
  if (field.unit === "£") return Number.isInteger(value) ? money(value) : moneyPrecise(value);
  return field.integer ? count(value) : String(value);
}

export interface Problem {
  field: string;
  message: string;
}

/**
 * What is wrong with `values`, at most one message per field. Each field is checked on its own
 * first (a number, whole if it must be, inside the training range); then thirteen rules that hold
 * for every holdout customer compare the fields that passed.
 */
export function problems(values: Values, fields: readonly Field[]): Problem[] {
  const found = new Map<string, string>();
  const flag = (field: string, message: string) => {
    if (!found.has(field)) found.set(field, message);
  };
  for (const field of fields) {
    const value = values[field.name];
    if (value === undefined || !Number.isFinite(value)) flag(field.name, "Enter a number.");
    else if (field.integer && !Number.isInteger(value)) flag(field.name, "Enter a whole number.");
    else if (value < field.min || value > field.max) {
      flag(field.name, `Between ${limitText(field, "min")} and ${limitText(field, "max")}.`);
    }
  }
  const valid = new Set(fields.map((f) => f.name).filter((name) => !found.has(name)));
  const v = (name: string) => (valid.has(name) ? values[name] : undefined);
  const recency = v("recency_days");
  const tenure = v("tenure_days");
  const n = v("n_purchase_days");
  const recent = v("purchases_90d");
  const spend = v("spend_90d");
  const before = v("spend_prev_90d");
  const total = v("total_spend");

  if (tenure !== undefined && recency !== undefined && tenure < recency) {
    flag("tenure_days", `At least the days since last purchase (${count(recency)}).`);
  }
  if (recent !== undefined && n !== undefined && recent > n) {
    flag("purchases_90d", `At most the purchase days in total (${count(n)}).`);
  }
  if (recent !== undefined && recency !== undefined) {
    if (recency < WINDOW_DAYS && recent < 1) {
      flag("purchases_90d", "At least 1: the last purchase was within 90 days.");
    }
    if (recency >= WINDOW_DAYS && recent > 0) {
      flag("purchases_90d", "0: the last purchase was more than 90 days ago.");
    }
  }
  if (spend !== undefined && recent !== undefined) {
    if (recent >= 1 && spend <= 0)
      flag("spend_90d", "More than £0: they bought in the last 90 days.");
    if (recent < 1 && spend > 0) flag("spend_90d", "£0: they bought nothing in the last 90 days.");
  }
  if (
    spend !== undefined &&
    before !== undefined &&
    total !== undefined &&
    spend + before > total + PENNY
  ) {
    flag("total_spend", `At least the spend of the last 180 days (${money(spend + before)}).`);
  }
  if (tenure !== undefined && recency !== undefined && n !== undefined && tenure >= recency) {
    const span = tenure - recency;
    if (n - 1 > span) {
      flag(
        "n_purchase_days",
        `At most ${count(span + 1)}: every purchase day falls between the first and the last.`,
      );
    }
  }
  // The window before the recent one (90–180 days before the cutoff).
  if (before !== undefined && before > 0) {
    if (recency !== undefined && recency >= 2 * WINDOW_DAYS) {
      flag("spend_prev_90d", "£0: their last purchase was 180 or more days ago.");
    }
    if (tenure !== undefined && tenure < WINDOW_DAYS) {
      flag("spend_prev_90d", "£0: their first purchase was within the last 90 days.");
    }
    if (n !== undefined && recent !== undefined && n <= recent) {
      flag("spend_prev_90d", "£0: every purchase day is within the last 90 days.");
    }
  }
  // A customer whose first purchase is recent has all their history in the recent window.
  if (tenure !== undefined && tenure < WINDOW_DAYS) {
    if (recent !== undefined && n !== undefined && recent !== n) {
      flag("purchases_90d", `All ${count(n)}: their first purchase was within the last 90 days.`);
    }
    if (spend !== undefined && total !== undefined && Math.abs(spend - total) > PENNY) {
      flag(
        "spend_90d",
        `The total spend (${money(total)}): their first purchase was within the last 90 days.`,
      );
    }
  }
  return [...found].map(([field, message]) => ({ field, message }));
}

function need(values: Values, name: string): number {
  const value = values[name];
  if (value === undefined) throw new Error(`the what-if has no value for ${name}`);
  return value;
}

const cents = (value: number) => Math.round(value * 100) / 100;

/**
 * The mockup's question, "what if they had ordered 30 days ago?", as one consistent edit: one more
 * purchase day of their usual size, `daysAgo` days before the cutoff. Null when they already
 * bought more recently than that.
 */
export function reorderedAgo(values: Values, daysAgo = 30): Record<string, number> | null {
  const recency = need(values, "recency_days");
  if (!(recency > daysAgo)) return null;
  const n = need(values, "n_purchase_days");
  const total = need(values, "total_spend");
  const order = total / n;
  return {
    ...values,
    recency_days: daysAgo,
    n_purchase_days: n + 1,
    purchases_90d: need(values, "purchases_90d") + 1,
    spend_90d: cents(need(values, "spend_90d") + order),
    total_spend: cents(total + order),
  };
}

/** `values` with spend per purchase day derived from total spend and purchase days. */
export function withComputed(values: Values): Record<string, number> {
  return {
    ...values,
    avg_order_value: need(values, "total_spend") / need(values, "n_purchase_days"),
  };
}

function baseOf(values: Values): BaseFeatures {
  return {
    recency_days: need(values, "recency_days"),
    n_purchase_days: need(values, "n_purchase_days"),
    tenure_days: need(values, "tenure_days"),
    spend_90d: need(values, "spend_90d"),
    spend_prev_90d: need(values, "spend_prev_90d"),
  };
}

/** The model's input row in `spec.order`: base, derived (recomputed) and context features. */
export function modelFeatures(values: Values, spec: FeatureSpec): Float64Array {
  const inputs: Record<string, number> = {
    ...withComputed(values),
    ...derivedFeatures(baseOf(values), spec),
    ...spec.context,
  };
  return Float64Array.from(spec.order, (name) => need(inputs, name));
}

export interface Priced {
  p: number;
  value: number;
  incentive: number;
  replacement: number;
  benefit: number;
  expProfit: number;
  breakEven: number;
}

/** The economics of a call for the edited customer: V from Gamma-Gamma and the new cadence. */
export function price(values: Values, p: number, spec: FeatureSpec, scenario: Scenario): Priced {
  const full = withComputed(values);
  const cadence = derivedFeatures(baseOf(full), spec).cadence_days;
  const aov = expectedAov(
    spec.gamma_gamma,
    need(full, "n_purchase_days"),
    need(full, "avg_order_value"),
  );
  const econ = customerEconomics(valueAtRisk([aov], [cadence], scenario), scenario);
  const first = (xs: Float64Array) => xs[0] as number;
  return {
    p,
    value: first(econ.value),
    incentive: first(econ.crc),
    replacement: first(econ.cac),
    benefit: first(econ.benefit),
    expProfit: first(expectedProfit([p], econ, scenario)),
    breakEven: first(breakEvenProbability(econ, scenario)),
  };
}
