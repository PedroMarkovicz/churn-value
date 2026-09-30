/**
 * Sensitivity page (spec §5.3): what a fixed list earns if acceptance differs from the assumption,
 * the analytic break-even acceptance, and the opportunity map and tornado of rebuilt lists.
 */
import { PARAMETER_ORDER, PARAMETERS, type Parameter, type Scenario } from "@/scenario/schema.ts";

import { type Campaign, summarizeList } from "./campaign.ts";
import type { CustomerTable } from "./table.ts";

/** A fixed list's realized profit is linear in acceptance: gamma * gain - loss. */
export interface AcceptanceLine {
  gain: number; // sum over called churners of (B - CRC)
  loss: number; // incentives to called stayers + contact costs
}

export function acceptanceLine(
  campaign: Campaign,
  table: CustomerTable,
  scenario: Scenario,
): AcceptanceLine {
  let gain = 0;
  let loss = scenario.contact_cost * campaign.k;
  for (let i = 0; i < table.n; i++) {
    if (campaign.selected[i] !== 1) continue;
    const crc = campaign.econ.crc[i] as number;
    if (table.churn[i] === 1) gain += (campaign.econ.benefit[i] as number) - crc;
    else loss += crc;
  }
  return { gain, loss };
}

export type BreakEven =
  | { kind: "rate"; gamma: number } // the list pays when acceptance exceeds gamma
  | { kind: "empty" } // nobody is called
  | { kind: "never" } // no churner on the list, or it loses at any rate
  | { kind: "always" }; // it pays even at zero acceptance

export function breakEvenAcceptance(line: AcceptanceLine, k: number): BreakEven {
  if (k === 0) return { kind: "empty" };
  if (line.loss <= 0) return { kind: "always" };
  if (line.gain <= 0) return { kind: "never" };
  const gamma = line.loss / line.gain;
  return gamma > 1 ? { kind: "never" } : { kind: "rate", gamma };
}

export interface StressPoint {
  gamma: number;
  fixed: number; // the list built for the assumed rate
  rebuilt: number; // a list rebuilt for this rate
}

export function stressCurve(
  table: CustomerTable,
  scenario: Scenario,
  line: AcceptanceLine,
  gammas: number[],
): StressPoint[] {
  return gammas.map((gamma) => ({
    gamma,
    fixed: gamma * line.gain - line.loss,
    rebuilt: summarizeList(table, { ...scenario, gamma }).realized,
  }));
}

/** min, min + step, ..., max, rounded so 0.05 steps print as 0.05. */
export function steps(min: number, max: number, step: number): number[] {
  const count = Math.round((max - min) / step) + 1;
  return Array.from({ length: count }, (_, i) => Number((min + i * step).toFixed(6)));
}

export interface OpportunityMap {
  gammas: number[];
  lambdaCs: number[];
  realized: Float64Array; // row-major: one row per lambda_c, one column per gamma
  k: Int32Array;
}

export function opportunityMap(
  table: CustomerTable,
  scenario: Scenario,
  gammas: number[],
  lambdaCs: number[],
): OpportunityMap {
  const realized = new Float64Array(gammas.length * lambdaCs.length);
  const k = new Int32Array(realized.length);
  lambdaCs.forEach((lambda_c, r) => {
    gammas.forEach((gamma, c) => {
      const list = summarizeList(table, { ...scenario, gamma, lambda_c });
      realized[r * gammas.length + c] = list.realized;
      k[r * gammas.length + c] = list.k;
    });
  });
  return { gammas, lambdaCs, realized, k };
}

export interface TornadoBar {
  parameter: Parameter;
  low: number; // worst realized profit across the parameter's range
  high: number; // best
  atLow: number; // parameter value that gave `low`
  atHigh: number;
}

/** Each assumption across its whole slider range, list rebuilt, others held; widest first. */
export function tornado(table: CustomerTable, scenario: Scenario, points = 41): TornadoBar[] {
  const bars = PARAMETER_ORDER.map((parameter) => {
    const spec = PARAMETERS[parameter];
    let low = Infinity;
    let high = -Infinity;
    let atLow = spec.min;
    let atHigh = spec.min;
    for (let j = 0; j < points; j++) {
      const value = spec.min + ((spec.max - spec.min) * j) / (points - 1);
      const profit = summarizeList(table, { ...scenario, [parameter]: value }).realized;
      if (profit < low) [low, atLow] = [profit, value];
      if (profit > high) [high, atHigh] = [profit, value];
    }
    return { parameter, low, high, atLow, atHigh };
  });
  return bars.sort((a, b) => b.high - b.low - (a.high - a.low));
}
