/**
 * One retention campaign under a scenario: who is called, what it is expected to earn, what it
 * earned on the holdout, and the account that explains the difference (spec §5.1-5.2).
 */
import type { Scenario } from "@/scenario/schema.ts";

import {
  customerEconomics,
  type Economics,
  expectedCost,
  expectedProfit,
  rankByExpectedProfit,
  realizedProfit,
  selectUnconstrained,
  selectWithBudget,
  valueAtRisk,
} from "./economics.ts";
import { type CustomerTable, probabilities } from "./table.ts";

/** Outcome of each customer on the holdout; the order is the field's legend order. */
export const OUTCOMES = ["hit", "waste", "miss", "quiet"] as const;
export type Outcome = (typeof OUTCOMES)[number];

export interface Account {
  keptNet: number; // churners kept, after their incentive: sum over called of y*gamma*(B - CRC)
  wasted: number; // incentives to customers who would have stayed: sum over called of (1 - y)*CRC
  contactCost: number; // c * k
  net: number; // keptNet - wasted - contactCost = realized profit of the list
  expectedNet: number; // what the list was expected to earn
  missed: number; // churners the list did not call
  callEveryone: number; // realized profit of calling all customers
}

export interface Campaign {
  model: string;
  econ: Economics;
  expProfit: Float64Array;
  expCost: Float64Array;
  realized: Float64Array; // per customer, if called
  order: Int32Array; // customers by expected profit, best first
  selected: Uint8Array; // 1 = called
  k: number;
  expected: number;
  realizedTotal: number;
  outcomes: Outcome[];
  counts: Record<Outcome, number>;
  account: Account;
  cumExpected: Float64Array; // length n + 1, along `order`
  cumRealized: Float64Array;
}

export function scenarioEconomics(table: CustomerTable, scenario: Scenario): Economics {
  return customerEconomics(valueAtRisk(table.aovGG, table.cadenceDays, scenario), scenario);
}

/** The list a model's probabilities select under the scenario (budget rules included). */
export function selectList(
  expProfit: Float64Array,
  expCost: Float64Array,
  scenario: Scenario,
): Uint8Array {
  if (scenario.budget_mode === "spend")
    return selectWithBudget(expProfit, expCost, scenario.budget_value, null);
  if (scenario.budget_mode === "calls")
    return selectWithBudget(expProfit, expCost, null, scenario.budget_value);
  return selectUnconstrained(expProfit);
}

function cumulative(values: Float64Array, order: Int32Array): Float64Array {
  const out = new Float64Array(order.length + 1);
  for (let r = 0; r < order.length; r++)
    out[r + 1] = (out[r] as number) + (values[order[r] as number] as number);
  return out;
}

export function runCampaign(
  table: CustomerTable,
  scenario: Scenario,
  model = table.deployed,
): Campaign {
  const p = probabilities(table, model);
  const econ = scenarioEconomics(table, scenario);
  const expProfit = expectedProfit(p, econ, scenario);
  const expCost = expectedCost(p, econ, scenario);
  const realized = realizedProfit(table.churn, econ, scenario);
  const order = rankByExpectedProfit(expProfit);
  const selected = selectList(expProfit, expCost, scenario);

  const counts: Record<Outcome, number> = { hit: 0, waste: 0, miss: 0, quiet: 0 };
  const outcomes: Outcome[] = [];
  let k = 0;
  let expected = 0;
  let realizedTotal = 0;
  let keptNet = 0;
  let wasted = 0;
  let callEveryone = 0;
  for (let i = 0; i < table.n; i++) {
    const churned = table.churn[i] === 1;
    const called = selected[i] === 1;
    const crc = econ.crc[i] as number;
    callEveryone += realized[i] as number;
    const outcome: Outcome = called ? (churned ? "hit" : "waste") : churned ? "miss" : "quiet";
    outcomes.push(outcome);
    counts[outcome] += 1;
    if (!called) continue;
    k += 1;
    expected += expProfit[i] as number;
    realizedTotal += realized[i] as number;
    if (churned) keptNet += scenario.gamma * ((econ.benefit[i] as number) - crc);
    else wasted += crc;
  }
  const contactCost = scenario.contact_cost * k;
  return {
    model,
    econ,
    expProfit,
    expCost,
    realized,
    order,
    selected,
    k,
    expected,
    realizedTotal,
    outcomes,
    counts,
    account: {
      keptNet,
      wasted,
      contactCost,
      net: keptNet - wasted - contactCost,
      expectedNet: expected,
      missed: counts.miss,
      callEveryone,
    },
    cumExpected: cumulative(expProfit, order),
    cumRealized: cumulative(realized, order),
  };
}

/** Smallest n whose cumulative expected profit reaches half the list's total (0 if none). */
export function halfValueCount(campaign: Campaign): number {
  if (campaign.expected <= 0) return 0;
  const half = campaign.expected / 2;
  for (let n = 1; n <= campaign.k; n++) {
    if ((campaign.cumExpected[n] as number) >= half) return n;
  }
  return campaign.k;
}

export interface ListSummary {
  k: number;
  realized: number;
}

/**
 * Size and realized profit of the list a scenario selects, without the ranking, curves or
 * account: the sensitivity grids rebuild the list hundreds of times per scenario.
 */
export function summarizeList(
  table: CustomerTable,
  scenario: Scenario,
  model = table.deployed,
): ListSummary {
  const p = probabilities(table, model);
  const econ = scenarioEconomics(table, scenario);
  const expProfit = expectedProfit(p, econ, scenario);
  const selected =
    scenario.budget_mode === "none"
      ? selectUnconstrained(expProfit)
      : selectList(expProfit, expectedCost(p, econ, scenario), scenario);
  const realized = realizedProfit(table.churn, econ, scenario);
  let k = 0;
  let total = 0;
  for (let i = 0; i < table.n; i++) {
    if (selected[i] !== 1) continue;
    k += 1;
    total += realized[i] as number;
  }
  return { k, realized: total };
}
