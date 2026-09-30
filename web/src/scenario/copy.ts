/** How the scenario reads in the interface: plain words, not parameter names (spec §3.1). */
import { money, moneyPrecise, percent } from "@/domain/format.ts";

import type { Parameter, Scenario } from "./schema.ts";

const DAYS_PER_MONTH = 365.25 / 12;

function trimNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function share(value: number): string {
  return percent(value, Number.isInteger(Math.round(value * 1000) / 10) ? 0 : 1);
}

/** The value as the slider shows it. */
export function formatParameter(name: Parameter, value: number): string {
  switch (name) {
    case "gamma":
    case "margin":
      return share(value);
    case "lambda_c":
      return `${share(value)} of value`;
    case "lambda_a":
      return `${trimNumber(value)}× the incentive`;
    case "contact_cost":
      return Number.isInteger(value) ? money(value) : moneyPrecise(value);
    case "value_horizon_days":
      return `${Math.round(value / DAYS_PER_MONTH)} months`;
  }
}

/** The chip in the scenario strip. */
export function chipText(name: Parameter, value: number): string {
  switch (name) {
    case "gamma":
      return `Acceptance ${share(value)}`;
    case "lambda_c":
      return `Incentive ${share(value)} of value`;
    case "lambda_a":
      return `Replacement ${trimNumber(value)}×`;
    case "margin":
      return `Margin ${share(value)}`;
    case "contact_cost":
      return `${formatParameter("contact_cost", value)} a call`;
    case "value_horizon_days":
      return `${Math.round(value / DAYS_PER_MONTH)}-month value`;
  }
}

export const HINTS: Record<Parameter, string> = {
  gamma:
    "Contacted churners who take the offer and stay. An assumption: the data has no campaign history.",
  lambda_c: "Cost of the offer, as a share of the customer's margin over the value horizon.",
  lambda_a: "Cost of winning a new customer, as a multiple of the offer.",
  margin: "Gross margin on revenue. The dataset has revenue only.",
  contact_cost: "Charged for every customer contacted.",
  value_horizon_days: "How far ahead a kept customer's margin counts.",
};

/** Which regime the benefit of keeping a customer is in: B = min(V, CAC), CAC/V = λa·λc. */
export function replacementRegime(scenario: Scenario): string {
  const ratio = scenario.lambda_a * scenario.lambda_c;
  if (Math.abs(ratio - 1) < 1e-9) return "Replacing a lost customer costs exactly their value.";
  if (ratio < 1) {
    return "Replacing a lost customer costs less than their value, so keeping one is worth the replacement cost.";
  }
  return "Replacing a lost customer costs more than their value, so keeping one is worth their value.";
}

export function budgetText(scenario: Scenario): string | null {
  if (scenario.budget_mode === "spend") return `Budget ${money(scenario.budget_value)}`;
  if (scenario.budget_mode === "calls") return `At most ${scenario.budget_value} calls`;
  return null;
}
