/**
 * The Customers page's export (spec §5.4): the rows in view with their economics, and the outcome
 * only when the page reveals it. Numbers are written plainly (no currency, no thousands separator).
 */
import { type Scenario, scenarioHash } from "@/scenario/schema.ts";

import type { CustomerRow, Decision } from "./customerList.ts";

export const CSV_COLUMNS = [
  "rank",
  "customer_id",
  "decision",
  "p_churn",
  "value",
  "incentive",
  "replacement_cost",
  "benefit",
  "expected_profit",
  "break_even_p",
  "recency_days",
  "n_purchase_days",
  "cadence_days",
  "is_uk",
] as const;

const DECISION: Record<Decision, string> = { call: "call", skip: "skip", budget: "over_budget" };

/** `value` with `digits` decimals; empty when not finite, and never "-0.00". */
function fixed(value: number, digits: number): string {
  if (!Number.isFinite(value)) return "";
  const text = value.toFixed(digits);
  return /^-0(\.0*)?$/.test(text) ? text.slice(1) : text;
}

export function customersCsv(rows: readonly CustomerRow[], revealed: boolean): string {
  const header = revealed ? [...CSV_COLUMNS, "outcome"] : [...CSV_COLUMNS];
  const lines = rows.map((row) =>
    [
      row.rank,
      row.id,
      DECISION[row.decision],
      fixed(row.p, 6),
      fixed(row.value, 2),
      fixed(row.incentive, 2),
      fixed(row.replacement, 2),
      fixed(row.benefit, 2),
      fixed(row.expProfit, 2),
      fixed(row.breakEven, 6),
      fixed(row.recencyDays, 0),
      fixed(row.nPurchaseDays, 0),
      fixed(row.cadenceDays, 2),
      row.isUk ? 1 : 0,
      ...(revealed ? [row.churned ? "churned" : "stayed"] : []),
    ].join(","),
  );
  return `${[header.join(","), ...lines].join("\n")}\n`;
}

export function csvFileName(scenario: Scenario): string {
  return `churn-value-customers-${scenarioHash(scenario)}.csv`;
}
