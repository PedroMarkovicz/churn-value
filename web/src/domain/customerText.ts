/**
 * The drawer's sentences (spec §5.4): the verdict, the story, the gauge and the money in words.
 * Every sentence is generated from the numbers, and every undefined case has its own sentence.
 */
import type { Contribution, ValueCheckRow } from "@/contract/index.ts";
import type { Scenario } from "@/scenario/schema.ts";

import type { CustomerRow, Decision } from "./customerList.ts";
import { count, days, money, moneyPrecise, percent } from "./format.ts";
import { reasonText } from "./reasons.ts";

export function verdict(decision: Decision): string {
  if (decision === "call") return "Worth a call.";
  if (decision === "budget") return "Worth a call, but outside the budget.";
  return "Not worth a call.";
}

/** The value horizon in months: 365 days is "12 months". */
export function horizonText(horizonDays: number): string {
  return `${count(Math.round(horizonDays / (365 / 12)))} months`;
}

/** A scenario share as a percent, with a decimal only when it has one (30%, 10.5%). */
export function share(fraction: number): string {
  const whole = Math.abs(fraction * 100 - Math.round(fraction * 100)) < 1e-9;
  return percent(fraction, whole ? 0 : 1);
}

type Rhythm = Pick<CustomerRow, "recencyDays" | "cadenceDays" | "nPurchaseDays">;

/** "A regular buyer who has gone quiet: 34 days past their usual reorder" */
export function buyerDescription(row: Rhythm, cadenceCv: number): string {
  const kind =
    row.nPurchaseDays <= 2
      ? `A customer with only ${count(row.nPurchaseDays)} purchase days`
      : cadenceCv < 1
        ? "A regular buyer"
        : "An irregular buyer";
  const late = Math.round(row.recencyDays - row.cadenceDays);
  if (late > 0) return `${kind} who has gone quiet: ${days(late)} past their usual reorder`;
  if (late === 0) return `${kind}, due to reorder about now`;
  return `${kind}, ${days(-late)} before their usual reorder`;
}

export function customerStory(row: CustomerRow, cadenceCv: number, horizonDays: number): string {
  return (
    `${buyerDescription(row, cadenceCv)}, with ${money(row.value)} of margin at stake over ` +
    `${horizonText(horizonDays)} and an offer that costs ${money(row.incentive)}.`
  );
}

/** p against p*; p* is undefined (NaN, Infinity) or above 1 when no probability makes a call pay. */
export function gaugeSentence(p: number, breakEven: number): string {
  const chance = `${percent(p, 1)} chance of leaving`;
  if (!Number.isFinite(breakEven) || breakEven > 1) {
    return `${chance}; under these assumptions no chance of leaving makes a call pay.`;
  }
  if (breakEven <= 0) {
    return `${chance}; under these assumptions any chance of leaving makes a call pay.`;
  }
  const needs = `${percent(breakEven, 1)} a call needs.`;
  if (p > breakEven) return `${chance}, above the ${needs}`;
  if (p < breakEven) return `${chance}, below the ${needs}`;
  return `${chance}, exactly the ${needs}`;
}

const callCost = (cost: number) => (Number.isInteger(cost) ? money(cost) : moneyPrecise(cost));

/** E[profit] = p·γ·(B − CRC) − (1 − p)·CRC − c, with the customer's numbers. */
export function moneyFormula(row: CustomerRow, scenario: Scenario): string {
  return (
    `${percent(row.p, 1)} × ${share(scenario.gamma)} accept × (${money(row.benefit)} − ` +
    `${money(row.incentive)}), minus ${percent(1 - row.p, 1)} × ${money(row.incentive)}, ` +
    `minus ${callCost(scenario.contact_cost)}`
  );
}

/** When the next purchase was due (last purchase + usual gap), against the cutoff. */
export function dueSentence(recencyDays: number, cadenceDays: number): string {
  const due = Math.round(cadenceDays - recencyDays);
  if (due < 0) return `Their next purchase was due ${days(-due)} before the cutoff.`;
  if (due > 0) return `Their next purchase was due ${days(due)} after the cutoff.`;
  return "Their next purchase was due at the cutoff.";
}

const lowerFirst = (text: string) => text.charAt(0).toLowerCase() + text.slice(1);

export function reasonsTitle(contributions: readonly Contribution[], horizonDays: number): string {
  const strongest = (list: readonly Contribution[]) =>
    list.reduce<Contribution | null>(
      (best, c) => (best === null || Math.abs(c.shap) > Math.abs(best.shap) ? c : best),
      null,
    );
  const risk = strongest(contributions.filter((c) => c.shap > 0));
  if (risk) return `The strongest reason for risk: ${lowerFirst(reasonText(risk, horizonDays))}.`;
  const calm = strongest(contributions);
  if (calm) {
    return `Every reason here lowers the risk, most of all: ${lowerFirst(reasonText(calm, horizonDays))}.`;
  }
  return "The model's explanation lists no reasons for this customer.";
}

/**
 * One line on what the edit does to the call (the expected profit before and after). Under a
 * budget, whether the list reaches the customer depends on everyone else, so the line speaks of
 * worth only.
 */
export function whatIfVerdict(before: number, after: number, budgeted = false): string {
  const reach = "the budget decides whether the list reaches them.";
  if (before > 0 && after > 0) {
    if (after < before / 4) {
      return budgeted
        ? `Still just above break-even; ${reach}`
        : "Still just above break-even: the list would keep them, barely.";
    }
    if (budgeted) return `Still worth a call; ${reach}`;
    return after < before
      ? "Still worth a call, though less than before."
      : "Still worth a call, and more than before.";
  }
  if (after > 0)
    return budgeted ? `Now worth a call; ${reach}` : "Now worth a call: the list would add them.";
  if (before > 0) {
    return budgeted
      ? "No longer worth a call."
      : "No longer worth a call: the list would drop them.";
  }
  return "Still not worth a call.";
}

const MONTH = new Intl.DateTimeFormat("en-GB", { month: "long", timeZone: "UTC" });

/** "September" for "2011-09-10". */
export function monthName(isoDate: string): string {
  return MONTH.format(new Date(`${isoDate}T00:00:00Z`));
}

/** Spec §13: said in the page's subline when short histories are most of the top 50. */
export function shortHistoryNote(rows: readonly CustomerRow[]): string | null {
  const top = rows.slice(0, 50);
  const short = top.filter((row) => row.nPurchaseDays <= 3).length;
  if (top.length === 0 || short * 2 <= top.length) return null;
  return `${count(short)} of the ${count(top.length)} best-ranked customers have three purchase days or fewer, so their value rests on a short history.`;
}

/** The "2 buys" marker's explanation, quoting the value backtest (contract 1.1.0) when present. */
export function shortHistoryHint(valueCheck: readonly ValueCheckRow[] | null | undefined): string {
  const base = "Only two purchase days, so their value is extrapolated from very little.";
  // Buckets are 2, 3, 4-5, 6-10 and 11+ (open-ended: max_purchase_days is null).
  const bucket = valueCheck?.find(
    (row) =>
      row.min_purchase_days <= 2 && (row.max_purchase_days === null || row.max_purchase_days >= 2),
  );
  const ratio = bucket?.ratio ?? null;
  if (ratio === null || !(ratio > 1)) return base;
  return `${base} For customers like them who stayed, the value formula overstated their revenue by ${percent(ratio - 1)}.`;
}
