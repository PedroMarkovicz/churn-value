/**
 * Retention economics, the TypeScript twin of ml/src/churnvalue/economics.py (design §4).
 * Operations run in the same order as numpy so results match the golden vectors to ~1e-15.
 */
import type { EconomicParams } from "@/contract/index.ts";

export type { EconomicParams };

export interface Economics {
  value: Float64Array; // V: margin at risk over the value horizon, conditional on staying
  crc: Float64Array; // retention incentive = lambda_c * V
  cac: Float64Array; // replacement cost = lambda_a * CRC
  benefit: Float64Array; // B = min(V, CAC)
}

type Numbers = ArrayLike<number>;

function map(n: number, f: (i: number) => number): Float64Array {
  const out = new Float64Array(n);
  for (let i = 0; i < n; i++) out[i] = f(i);
  return out;
}

const at = (xs: Numbers, i: number): number => xs[i] as number;

export function valueAtRisk(
  aov: Numbers,
  cadenceDays: Numbers,
  params: EconomicParams,
): Float64Array {
  return map(
    aov.length,
    (i) => params.margin * at(aov, i) * (params.value_horizon_days / at(cadenceDays, i)),
  );
}

export function customerEconomics(value: Numbers, params: EconomicParams): Economics {
  const v = Float64Array.from(value);
  const crc = map(v.length, (i) => params.lambda_c * at(v, i));
  const cac = map(v.length, (i) => params.lambda_a * at(crc, i));
  const benefit = map(v.length, (i) => Math.min(at(v, i), at(cac, i)));
  return { value: v, crc, cac, benefit };
}

/** E[profit | contact] = p*gamma*(B - CRC) - (1 - p)*CRC - c. */
export function expectedProfit(p: Numbers, econ: Economics, params: EconomicParams): Float64Array {
  return map(p.length, (i) => {
    const crc = at(econ.crc, i);
    return (
      at(p, i) * params.gamma * (at(econ.benefit, i) - crc) -
      (1.0 - at(p, i)) * crc -
      params.contact_cost
    );
  });
}

/** Per-customer p* where expected profit is zero: (CRC + c) / (gamma*(B - CRC) + CRC). */
export function breakEvenProbability(econ: Economics, params: EconomicParams): Float64Array {
  return map(econ.crc.length, (i) => {
    const crc = at(econ.crc, i);
    return (crc + params.contact_cost) / (params.gamma * (at(econ.benefit, i) - crc) + crc);
  });
}

/** Expected spend of one contact: incentive paid by accepting churners and all non-churners. */
export function expectedCost(p: Numbers, econ: Economics, params: EconomicParams): Float64Array {
  return map(
    p.length,
    (i) => params.contact_cost + at(econ.crc, i) * (at(p, i) * params.gamma + 1.0 - at(p, i)),
  );
}

/** Profit of contacting each customer given the true label, acceptance taken in expectation. */
export function realizedProfit(y: Numbers, econ: Economics, params: EconomicParams): Float64Array {
  return map(y.length, (i) => {
    const crc = at(econ.crc, i);
    return (
      at(y, i) * params.gamma * (at(econ.benefit, i) - crc) -
      (1.0 - at(y, i)) * crc -
      params.contact_cost
    );
  });
}

/** Customer indices by expected profit, highest first; ties keep their original order. */
export function rankByExpectedProfit(expProfit: Numbers): Int32Array {
  const order = Array.from({ length: expProfit.length }, (_, i) => i);
  order.sort((a, b) => at(expProfit, b) - at(expProfit, a)); // Array.sort is stable
  return Int32Array.from(order);
}

/** Bayes-optimal rule with calibrated p: contact iff expected profit is positive. */
export function selectUnconstrained(expProfit: Numbers): Uint8Array {
  return Uint8Array.from({ length: expProfit.length }, (_, i) => (at(expProfit, i) > 0 ? 1 : 0));
}

/** Greedy top-k by expected profit among positive-profit customers, within budget/capacity. */
export function selectWithBudget(
  expProfit: Numbers,
  expCost: Numbers,
  budget: number | null,
  maxContacts: number | null,
): Uint8Array {
  const order = rankByExpectedProfit(expProfit);
  const mask = new Uint8Array(expProfit.length);
  let spend = 0;
  for (let rank = 0; rank < order.length; rank++) {
    const i = order[rank] as number;
    // Once a customer is not worth contacting, no later one is (the order is by profit).
    if (!(at(expProfit, i) > 0)) break;
    if (maxContacts !== null && rank >= maxContacts) break;
    spend += at(expCost, i);
    if (budget !== null && spend > budget) break;
    mask[i] = 1;
  }
  return mask;
}
