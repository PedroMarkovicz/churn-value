/**
 * The Customers page's rows (spec §5.4): one per holdout customer in rank order, with the decision
 * under the scenario and the numbers the table, the drawer and the CSV show. Filtering, search and
 * sorting are plain functions over 1,920 rows, so no table library is needed.
 */
import type { Scenario } from "@/scenario/schema.ts";

import type { Campaign } from "./campaign.ts";
import { breakEvenProbability } from "./economics.ts";
import { type CustomerTable, feature, probabilities } from "./table.ts";

/** "budget": worth a call (expected profit > 0), but the budget ran out before them. */
export type Decision = "call" | "skip" | "budget";

export interface CustomerRow {
  index: number; // position in the customer table
  id: number;
  rank: number; // 1 = the best expected profit of a call
  decision: Decision;
  p: number; // calibrated churn probability of the deployed model
  value: number; // V: margin at stake over the value horizon
  incentive: number; // CRC
  replacement: number; // CAC
  benefit: number; // B = min(V, CAC)
  expProfit: number;
  breakEven: number; // p*; may exceed 1 or be non-finite when no probability makes a call pay
  churned: boolean;
  isUk: boolean;
  nPurchaseDays: number;
  recencyDays: number;
  cadenceDays: number;
}

const at = (xs: ArrayLike<number>, i: number) => xs[i] as number;

export function customerRows(
  table: CustomerTable,
  campaign: Campaign,
  scenario: Scenario,
): CustomerRow[] {
  const p = probabilities(table, campaign.model);
  const breakEven = breakEvenProbability(campaign.econ, scenario);
  const isUk = feature(table, "is_uk");
  const nDays = feature(table, "n_purchase_days");
  const recency = feature(table, "recency_days");
  return Array.from(campaign.order, (index, position) => {
    const expProfit = at(campaign.expProfit, index);
    const decision: Decision =
      campaign.selected[index] === 1 ? "call" : expProfit > 0 ? "budget" : "skip";
    return {
      index,
      id: at(table.ids, index),
      rank: position + 1,
      decision,
      p: at(p, index),
      value: at(campaign.econ.value, index),
      incentive: at(campaign.econ.crc, index),
      replacement: at(campaign.econ.cac, index),
      benefit: at(campaign.econ.benefit, index),
      expProfit,
      breakEven: at(breakEven, index),
      churned: table.churn[index] === 1,
      isUk: at(isUk, index) === 1,
      nPurchaseDays: at(nDays, index),
      recencyDays: at(recency, index),
      cadenceDays: at(table.cadenceDays, index),
    };
  });
}

export type DecisionFilter = "call" | "skip" | "all";
export type CountryFilter = "all" | "uk" | "outside";
export type SortKey = "rank" | "p" | "value" | "incentive" | "expProfit";

export interface ListOptions {
  query: string; // customer id prefix
  decision: DecisionFilter;
  country: CountryFilter;
  sort: SortKey;
  descending: boolean;
}

export const DEFAULT_LIST: ListOptions = {
  query: "",
  decision: "call",
  country: "all",
  sort: "rank",
  descending: false,
};

/** The rows in view: filtered, searched by id prefix, then sorted (rank breaks ties). */
export function listView(rows: readonly CustomerRow[], options: ListOptions): CustomerRow[] {
  const query = options.query.trim();
  const view = rows.filter(
    (row) =>
      (options.decision === "all" || (row.decision === "call") === (options.decision === "call")) &&
      (options.country === "all" || row.isUk === (options.country === "uk")) &&
      (query === "" || String(row.id).startsWith(query)),
  );
  const key = options.sort;
  const sign = options.descending ? -1 : 1;
  return view.sort((a, b) => sign * (a[key] - b[key]) || a.rank - b.rank);
}

/** The options after clicking column `key`: the same column flips, a new one starts at its best. */
export function nextSort(options: ListOptions, key: SortKey): ListOptions {
  if (options.sort === key) return { ...options, descending: !options.descending };
  return { ...options, sort: key, descending: key !== "rank" };
}

export function decisionCounts(rows: readonly CustomerRow[]): {
  call: number;
  skip: number;
  all: number;
} {
  const call = rows.filter((row) => row.decision === "call").length;
  return { call, skip: rows.length - call, all: rows.length };
}
