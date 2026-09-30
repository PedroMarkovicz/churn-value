// @vitest-environment node
import { derivedFeatures } from "@/domain/derived.ts";
import {
  breakEvenProbability,
  customerEconomics,
  expectedCost,
  expectedProfit,
  realizedProfit,
  selectUnconstrained,
  selectWithBudget,
  valueAtRisk,
} from "@/domain/economics.ts";
import { expectedAov } from "@/domain/gammaGamma.ts";

import { close, derivedGolden, economicsGolden, gammaGammaGolden } from "../golden.ts";

describe("economics matches Python's golden vectors", () => {
  const tol = economicsGolden.tolerance;

  test.each(economicsGolden.cases.map((c, i) => [i, c] as const))("case %i", (_i, c) => {
    const econ = customerEconomics(valueAtRisk([c.aov_gg], [c.cadence_days], c.params), c.params);
    const profit = expectedProfit([c.p], econ, c.params);
    const got = {
      value: econ.value[0],
      crc: econ.crc[0],
      cac: econ.cac[0],
      benefit: econ.benefit[0],
      expected_profit: profit[0],
      break_even_p: breakEvenProbability(econ, c.params)[0],
      expected_cost: expectedCost([c.p], econ, c.params)[0],
      realized_profit: realizedProfit([c.churn], econ, c.params)[0],
    };
    for (const [key, value] of Object.entries(got)) {
      const expected = c[key as keyof typeof got];
      expect(close(value as number, expected, tol), `${key}: ${value} vs ${expected}`).toBe(true);
    }
    expect(selectUnconstrained(profit)[0] === 1).toBe(c.contact);
  });

  test.each(economicsGolden.budget_cases.map((c, i) => [i, c] as const))(
    "budget case %i",
    (_i, c) => {
      const mask = selectWithBudget(
        c.expected_profit,
        c.expected_cost,
        c.budget ?? null,
        c.max_contacts ?? null,
      );
      expect(Array.from(mask, (v) => v === 1)).toEqual(c.selected);
    },
  );
});

test.each(derivedGolden.cases.map((c, i) => [i, c] as const))(
  "derived features case %i",
  (_i, c) => {
    const got = derivedFeatures(
      {
        recency_days: c.base.recency_days ?? NaN,
        n_purchase_days: c.base.n_purchase_days ?? NaN,
        tenure_days: c.base.tenure_days ?? NaN,
        spend_90d: c.base.spend_90d ?? NaN,
        spend_prev_90d: c.base.spend_prev_90d ?? NaN,
      },
      derivedGolden,
    );
    for (const [key, expected] of Object.entries(c.derived)) {
      const value = got[key as keyof typeof got];
      expect(
        close(value, expected, derivedGolden.tolerance),
        `${key}: ${value} vs ${expected}`,
      ).toBe(true);
    }
  },
);

test.each(gammaGammaGolden.cases.map((c, i) => [i, c] as const))("Gamma-Gamma case %i", (_i, c) => {
  const got = expectedAov(c.params, c.n_purchase_days, c.avg_order_value);
  expect(close(got, c.aov_gg, gammaGammaGolden.tolerance)).toBe(true);
});
