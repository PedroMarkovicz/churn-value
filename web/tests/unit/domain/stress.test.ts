import { bootstrapIntervals, percentile } from "@/domain/bootstrap.ts";
import { runCampaign } from "@/domain/campaign.ts";
import { comparePolicies } from "@/domain/policies.ts";
import {
  acceptanceLine,
  breakEvenAcceptance,
  opportunityMap,
  steps,
  stressCurve,
  tornado,
} from "@/domain/stress.ts";
import { buildTable } from "@/domain/table.ts";
import { DEFAULT_SCENARIO } from "@/scenario/schema.ts";

import { customerFixture, customersFixture, MODELS } from "../fixtures/artifacts.ts";

const table = buildTable(
  customersFixture([
    customerFixture(1, 0.8, 1, 100),
    customerFixture(2, 0.7, 0, 100),
    customerFixture(3, 0.6, 1, 50),
    customerFixture(4, 0.05, 1, 100),
    customerFixture(5, 0.02, 0, 100),
  ]),
);

test("the fixed list crosses zero exactly at the analytic break-even acceptance", () => {
  const campaign = runCampaign(table, DEFAULT_SCENARIO);
  const line = acceptanceLine(campaign, table, DEFAULT_SCENARIO);
  const breakEven = breakEvenAcceptance(line, campaign.k);
  expect(breakEven.kind).toBe("rate");
  if (breakEven.kind !== "rate") return;
  const [point] = stressCurve(table, DEFAULT_SCENARIO, line, [breakEven.gamma]);
  expect(point?.fixed).toBeCloseTo(0, 9);
  // at the assumed rate the fixed list earns what the campaign realized
  const [assumed] = stressCurve(table, DEFAULT_SCENARIO, line, [DEFAULT_SCENARIO.gamma]);
  expect(assumed?.fixed).toBeCloseTo(campaign.realizedTotal, 9);
});

test("break-even has explicit answers for empty, hopeless and free lists", () => {
  expect(breakEvenAcceptance({ gain: 10, loss: 5 }, 0)).toEqual({ kind: "empty" });
  expect(breakEvenAcceptance({ gain: 0, loss: 5 }, 3)).toEqual({ kind: "never" });
  expect(breakEvenAcceptance({ gain: 4, loss: 5 }, 3)).toEqual({ kind: "never" }); // needs > 100 %
  expect(breakEvenAcceptance({ gain: 4, loss: 0 }, 3)).toEqual({ kind: "always" });
});

test("steps includes both ends without floating-point dust", () => {
  expect(steps(0, 0.5, 0.025)).toHaveLength(21);
  expect(steps(0, 1, 0.05)[3]).toBe(0.15);
});

test("the opportunity map rebuilds the list for every cell", () => {
  const map = opportunityMap(table, DEFAULT_SCENARIO, [0, 0.3, 1], [0.1]);
  expect(map.realized).toHaveLength(3);
  expect(map.k[0]).toBe(0); // no acceptance: nobody is worth a call
  expect(map.realized[1]).toBeCloseTo(runCampaign(table, DEFAULT_SCENARIO).realizedTotal, 9);
});

test("the tornado sorts assumptions by how much they move profit", () => {
  const bars = tornado(table, DEFAULT_SCENARIO, 11);
  expect(bars).toHaveLength(6);
  const spans = bars.map((bar) => bar.high - bar.low);
  expect(spans).toEqual([...spans].sort((a, b) => b - a));
});

test("policies: oracle is the ceiling, random is the scaled total, one model is deployed", () => {
  const comparison = comparePolicies(table, DEFAULT_SCENARIO, MODELS);
  const byId = new Map(comparison.rows.map((row) => [row.id, row]));
  const oracle = byId.get("oracle")?.realized ?? NaN;
  for (const row of comparison.rows) expect(row.realized).toBeLessThanOrEqual(oracle + 1e-9);
  const everyone = byId.get("everyone")?.realized ?? NaN;
  const deployed = byId.get("gbdt_b");
  expect(deployed?.deployed).toBe(true);
  expect(byId.get("random")?.realized).toBeCloseTo(((deployed?.k ?? 0) / 5) * everyone, 9);
  expect(comparison.shareOfOracle).toBeCloseTo((deployed?.realized ?? NaN) / oracle, 12);
});

test("percentile matches numpy's linear interpolation", () => {
  const sorted = Float64Array.from([1, 2, 3, 4]);
  expect(percentile(sorted, 50)).toBe(2.5); // numpy.percentile([1, 2, 3, 4], 50)
  expect(percentile(sorted, 2.5)).toBeCloseTo(1.075, 12);
  expect(percentile(sorted, 97.5)).toBeCloseTo(3.925, 12);
});

test("bootstrap intervals are reproducible and contain the point estimate", () => {
  const contributions = Float64Array.from({ length: 200 }, (_, i) => (i % 7) - 2);
  const mask = Uint8Array.from({ length: 200 }, (_, i) => (i % 3 === 0 ? 1 : 0));
  const point = contributions.reduce((s, v, i) => s + (mask[i] === 1 ? v : 0), 0);
  const [first] = bootstrapIntervals(contributions, [mask], 300, 7);
  const [second] = bootstrapIntervals(contributions, [mask], 300, 7);
  expect(first).toEqual(second);
  expect(first?.low).toBeLessThan(point);
  expect(first?.high).toBeGreaterThan(point);
});
