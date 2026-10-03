/**
 * The Method page (spec §5.6) as rows and sentences: the validation calendar, the value backtest
 * and the assumptions table, from evaluation.json and the scenario's own table.
 */
import type { EconomicParams, EvaluationFile, ValueCheckRow } from "@/contract/index.ts";
import { formatParameter } from "@/scenario/copy.ts";
import { type Parameter, PARAMETER_ORDER, PARAMETERS } from "@/scenario/schema.ts";

import { monthName } from "./customerText.ts";
import { count, percent } from "./format.ts";

// --- validation calendar ----------------------------------------------------------------------

export type Stage = "train" | "gap" | "calibration" | "test";

export interface CalendarRow {
  cutoff: string;
  stage: Stage;
  outcomeEnd: string; // cutoff + H days: when this cutoff's label is known
}

function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function validationCalendar(
  split: EvaluationFile["split"],
  cutoffs: readonly string[],
  horizonDays: number,
): CalendarRow[] {
  const all = [...new Set([...split.train, split.calibration, split.test, ...cutoffs])].sort();
  const train = new Set(split.train);
  return all.map((cutoff) => ({
    cutoff,
    stage: train.has(cutoff)
      ? "train"
      : cutoff === split.calibration
        ? "calibration"
        : cutoff === split.test
          ? "test"
          : "gap",
    outcomeEnd: addDays(cutoff, horizonDays),
  }));
}

export function calendarTitle(rows: readonly CalendarRow[]): string {
  const calibration = rows.find((r) => r.stage === "calibration");
  const test = rows.find((r) => r.stage === "test");
  if (!calibration || !test) return "This release has no validation calendar";
  const trained = rows.filter((r) => r.stage === "train").length;
  return `Learn from ${count(trained)} past months, calibrate on ${monthName(calibration.cutoff)}, judge on ${monthName(test.cutoff)}`;
}

// --- value backtest ---------------------------------------------------------------------------

export interface ValueBar {
  bucket: string;
  label: string; // "4–5 purchase days"
  n: number;
  predicted: number;
  actual: number;
  ratio: number | null; // predicted ÷ actual revenue in the window, for customers who stayed
}

export function valueBars(valueCheck: readonly ValueCheckRow[] | null | undefined): ValueBar[] {
  return (valueCheck ?? []).map((row) => ({
    bucket: row.bucket,
    label:
      row.max_purchase_days === null
        ? `${count(row.min_purchase_days)} or more purchase days`
        : row.max_purchase_days === row.min_purchase_days
          ? `${count(row.min_purchase_days)} purchase days`
          : `${count(row.min_purchase_days)}–${count(row.max_purchase_days)} purchase days`,
    n: row.n,
    predicted: row.predicted_revenue,
    actual: row.actual_revenue,
    ratio: row.ratio,
  }));
}

export function overallRatio(bars: readonly ValueBar[]): number | null {
  const actual = bars.reduce((sum, b) => sum + b.actual, 0);
  if (!(actual > 0)) return null;
  return bars.reduce((sum, b) => sum + b.predicted, 0) / actual;
}

export function valueTitle(bars: readonly ValueBar[]): string {
  const ratio = overallRatio(bars);
  if (ratio === null) return "This release has no value backtest";
  return ratio <= 1 ? "The value estimate is conservative" : "The value estimate runs high";
}

export function valueNote(bars: readonly ValueBar[]): string {
  const measured = bars.filter((b) => b.ratio !== null);
  if (measured.length === 0) return "No bucket was measured.";
  const unmeasured = bars.filter((b) => b.ratio === null);
  const tail =
    unmeasured.length > 0 ? ` Not measured: ${unmeasured.map((b) => b.label).join(", ")}.` : "";
  const over = measured.filter((b) => (b.ratio ?? 0) > 1);
  if (over.length === 0) return `No bucket is overstated.${tail}`;
  if (over.length === measured.length) {
    return unmeasured.length > 0
      ? `Every measured bucket is overstated.${tail}`
      : "Every bucket is overstated.";
  }
  if (over.length === 1) {
    const bar = over[0] as ValueBar;
    const marked = bar.bucket === "2" ? "; the list marks them" : ""; // the "2 buys" marker (3b)
    return `Only customers with ${bar.label} are overstated, by ${percent((bar.ratio ?? 1) - 1)}${marked}.${tail}`;
  }
  return `${count(over.length)} of ${count(measured.length)} buckets are overstated: ${over.map((b) => b.label).join(", ")}.${tail}`;
}

// --- assumptions ------------------------------------------------------------------------------

export interface AssumptionRow {
  name: string;
  symbol: string;
  value: string;
  range: string;
  source: string;
}

/** Symbols and sources (docs/design.md §4.4). Symbols appear only on the Method page (spec §3.1). */
const ASSUMPTIONS: Record<Parameter, { symbol: string; source: string }> = {
  gamma: {
    symbol: "γ",
    source:
      "An assumption, not an estimate: the data has no campaign history. Prior from the retention-profit literature, Beta(6, 14), mean 0.3.",
  },
  lambda_c: {
    symbol: "λc",
    source: "The literature uses about 5% of customer value (Verbraken et al., 2013); 10% here.",
  },
  lambda_a: {
    symbol: "λa",
    source: "The middle of the 5 to 25 times rule of thumb for acquiring a customer.",
  },
  margin: { symbol: "m", source: "Assumed: the dataset has revenue only, not costs." },
  contact_cost: { symbol: "c", source: "Assumed cost of one outbound call." },
  value_horizon_days: {
    symbol: "T",
    source: "One year of margin; 90 days reproduces a window-revenue view.",
  },
};

export function assumptionRows(economics: EconomicParams): AssumptionRow[] {
  return PARAMETER_ORDER.map((name) => {
    const spec = PARAMETERS[name];
    return {
      name: spec.label,
      symbol: ASSUMPTIONS[name].symbol,
      value: formatParameter(name, economics[name]),
      range: `${formatParameter(name, spec.min)} to ${formatParameter(name, spec.max)}`,
      source: ASSUMPTIONS[name].source,
    };
  });
}
