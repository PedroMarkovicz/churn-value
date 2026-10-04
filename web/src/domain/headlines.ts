/**
 * Every page opens with its answer as one sentence, generated from the live results (spec §3.1).
 * Empty states are explicit sentences, never NaN or a blank.
 */
import type { Scenario } from "@/scenario/schema.ts";

import { count, money, percent } from "./format.ts";
import type { BreakEven, TornadoBar } from "./stress.ts";

const BUDGET_EMPTY = "The budget does not cover a single call worth making.";

export function overviewHeadline(n: number, k: number, realized: number): string {
  if (k === 0) return "Under these assumptions no customer is worth a call.";
  const verb = realized < 0 ? "would have lost" : "earned";
  return `Of ${count(n)} customers due to buy again, calling ${count(k)} ${verb} ${money(Math.abs(realized))}.`;
}

export function simulatorHeadline(
  scenario: Scenario,
  k: number,
  expected: number,
  realized: number,
  kWithoutBudget = k, // how many would be called with no budget: tells the two empty lists apart
): string {
  if (k === 0 && scenario.budget_mode !== "none" && kWithoutBudget > 0) return BUDGET_EMPTY;
  if (k === 0) return "Under these assumptions no customer is worth a call.";
  const outcome = `${money(expected)} expected, ${money(realized)} on the holdout.`;
  if (scenario.budget_mode === "spend") {
    return `With a ${money(scenario.budget_value)} budget, call the best ${count(k)}: ${outcome}`;
  }
  if (scenario.budget_mode === "calls") {
    return `With room for ${count(scenario.budget_value)} calls, make ${count(k)}: ${outcome}`;
  }
  return `Call the ${count(k)} customers worth calling: ${outcome}`;
}

export function sensitivityHeadline(breakEven: BreakEven, budgetIsTheLimit = false): string {
  switch (breakEven.kind) {
    case "empty":
      return budgetIsTheLimit
        ? BUDGET_EMPTY
        : "No customer is worth a call under these assumptions.";
    case "no-churners":
      return "Nobody on this list would have left, so it cannot pay at any acceptance rate.";
    case "never":
      return "This list loses money at any acceptance rate.";
    case "always":
      return "This list pays even if nobody accepts the offer.";
    case "rate":
      return `This list keeps paying as long as at least ${percent(breakEven.gamma, 1)} of churners accept the offer.`;
  }
}

/** The policy comparison's title; `share` is the model's profit as a share of perfect foresight's. */
export function policyTitle(share: number | null): string {
  if (share === null) return "What each policy would have earned";
  if (share < 0)
    return "The model loses money under these assumptions; perfect foresight would not";
  return `The model keeps ${percent(share)} of what perfect foresight would earn`;
}

export function customersHeadline(k: number, expected: number, halfCount: number): string {
  if (k === 0) return "Under these assumptions no customer is worth a call.";
  const noun = k === 1 ? "customer" : "customers";
  const head = `${count(k)} ${noun} to call, worth ${money(expected)} together.`;
  if (halfCount <= 0 || halfCount >= k) return head;
  return `${head} The first ${count(halfCount)} bring half of it.`;
}

/** The tornado's title names the widest assumption, and says "combined" only when it is true. */
export function tornadoTitle(bars: TornadoBar[], labels: Record<string, string>): string {
  const [widest, ...rest] = bars;
  if (!widest) return "How much each assumption moves the result";
  const span = widest.high - widest.low;
  const others = rest.reduce((sum, bar) => sum + (bar.high - bar.low), 0);
  const name = labels[widest.parameter] ?? widest.parameter;
  if (rest.length > 0 && span > others) {
    return `${name} matters more than every other assumption combined`;
  }
  return `${name} moves the result more than any other assumption`;
}
