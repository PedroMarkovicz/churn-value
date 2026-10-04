/**
 * Plain-language reasons (spec §5.4, item 6). One template per customer feature turns the
 * customer's value into a fact ("No spend in the last 90 days"). Whether that fact raises or
 * lowers the risk comes from the sign of its SHAP value and is drawn by the chart, not written.
 */
import type { Contribution } from "@/contract/index.ts";

import { count, days, money, percent } from "./format.ts";

type Template = (value: number, horizonDays: number) => string;

const oneDecimal = (value: number) => (Math.round(value * 10) / 10).toFixed(1);
const plural = (value: number, one: string, many: string) => (Math.round(value) === 1 ? one : many);

export const REASONS: Record<string, Template> = {
  recency_days: (v) => `Last purchase ${days(v)} ago`,
  n_purchase_days: (v) =>
    v <= 2 ? `Only ${count(v)} purchase days so far` : `${count(v)} purchase days so far`,
  tenure_days: (v) => `First purchase ${days(v)} ago`,
  total_spend: (v) => `${money(v)} spent in total`,
  avg_order_value: (v) => `${money(v)} spent per purchase day`,
  n_distinct_products: (v) => `${count(v)} different ${plural(v, "product", "products")} bought`,
  return_rate: (v) =>
    v <= 0 ? "Nothing returned" : `${percent(v, v < 0.1 ? 1 : 0)} of spend returned`,
  spend_90d: (v) =>
    v <= 0 ? "No spend in the last 90 days" : `${money(v)} spent in the last 90 days`,
  spend_prev_90d: (v) =>
    v <= 0
      ? "No spend in the 90 days before those"
      : `${money(v)} spent in the 90 days before those`,
  purchases_90d: (v) =>
    v <= 0
      ? "No purchase in the last 90 days"
      : `${count(v)} purchase ${plural(v, "day", "days")} in the last 90 days`,
  cadence_cv: (v) =>
    v < 0.5
      ? "Reorders at a steady rhythm"
      : v < 1
        ? "Reorders at a fairly regular rhythm"
        : "Reorders at an irregular rhythm",
  bought_same_window_last_year: (v) =>
    v >= 1 ? "Bought in this season last year" : "Did not buy in this season last year",
  is_uk: (v) => (v >= 1 ? "Based in the United Kingdom" : "Based outside the United Kingdom"),
  cadence_days: (v) => `Reorders about every ${days(v)}`,
  overdue_ratio: (v) =>
    v < 1
      ? "Not yet past their usual reorder"
      : `${oneDecimal(v)} times their usual gap since the last purchase`,
  expected_purchases_h: (v, h) =>
    `About ${oneDecimal(v)} purchase days expected in the next ${count(h)} days at their pace`,
  spend_trend: (v) =>
    v <= 0
      ? "Spend stopped this quarter"
      : v < 1
        ? "Spending less than the quarter before"
        : "Spending at least as much as the quarter before",
};

/** The fact behind one SHAP contribution; a feature without a template reads as name and value. */
export function reasonText(contribution: Contribution, horizonDays: number): string {
  const template = REASONS[contribution.feature];
  if (template) return template(contribution.value, horizonDays);
  return `${contribution.feature.replaceAll("_", " ")}: ${contribution.value}`;
}

/** A reason's direction; "no effect" when its size rounds to 0.00, which has no sign. */
export function effectText(shap: number): "raises the risk" | "lowers the risk" | "no effect" {
  const rounded = Math.round(shap * 100) / 100;
  if (rounded === 0) return "no effect";
  return rounded > 0 ? "raises the risk" : "lowers the risk";
}

/** +0.16, −0.21 and 0.00: a SHAP value with its sign, never "−0.00". */
export function signedShap(shap: number): string {
  const rounded = Math.round(shap * 100) / 100;
  if (rounded === 0) return "0.00";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded).toFixed(2)}`;
}
