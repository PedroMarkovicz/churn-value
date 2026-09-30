import { halfValueCount, runCampaign, summarizeList } from "@/domain/campaign.ts";
import { buildTable } from "@/domain/table.ts";
import { DEFAULT_SCENARIO, type Scenario } from "@/scenario/schema.ts";

import { customerFixture, customersFixture } from "../fixtures/artifacts.ts";

// Six customers, cadence 30 days: V = 0.35 * aov * 365 / 30, so aov 100 gives V = 425.83.
const table = buildTable(
  customersFixture([
    customerFixture(1, 0.8, 1, 100), // likely churner, did churn: a hit
    customerFixture(2, 0.7, 0, 100), // likely churner who stayed: incentive wasted
    customerFixture(3, 0.6, 1, 50),
    customerFixture(4, 0.05, 1, 100), // unlikely churner who churned: missed
    customerFixture(5, 0.02, 0, 100), // quiet
    customerFixture(6, 0.1, 0, 10), // unlikely to leave and small: not worth a call
  ]),
);

test("the default campaign calls exactly the customers with positive expected profit", () => {
  const campaign = runCampaign(table, DEFAULT_SCENARIO);
  const called = [...campaign.selected].flatMap((v, i) => (v === 1 ? [table.ids[i]] : []));
  expect(called).toEqual([1, 2, 3]);
  expect(campaign.k).toBe(3);
  expect(campaign.outcomes).toEqual(["hit", "waste", "hit", "miss", "quiet", "quiet"]);
  expect(campaign.counts).toEqual({ hit: 2, waste: 1, miss: 1, quiet: 2 });
});

test("the account adds up to the list's realized profit", () => {
  const { account, realizedTotal, expected } = runCampaign(table, DEFAULT_SCENARIO);
  expect(account.keptNet - account.wasted - account.contactCost).toBeCloseTo(realizedTotal, 9);
  expect(account.net).toBeCloseTo(realizedTotal, 9);
  expect(account.expectedNet).toBe(expected);
  expect(account.contactCost).toBe(3);
  expect(account.missed).toBe(1);
});

test("cumulative curves follow the ranking and end at calling everyone", () => {
  const campaign = runCampaign(table, DEFAULT_SCENARIO);
  expect(campaign.cumExpected[0]).toBe(0);
  expect(campaign.cumRealized[campaign.k]).toBeCloseTo(campaign.realizedTotal, 9);
  expect(campaign.cumRealized[table.n]).toBeCloseTo(campaign.account.callEveryone, 9);
  const ranked = [...campaign.order].map((i) => campaign.expProfit[i] as number);
  expect(ranked).toEqual([...ranked].sort((a, b) => b - a));
});

test("a budget in calls keeps the best customers only", () => {
  const byCalls: Scenario = { ...DEFAULT_SCENARIO, budget_mode: "calls", budget_value: 1 };
  expect(runCampaign(table, byCalls).k).toBe(1);
  const bySpend: Scenario = { ...DEFAULT_SCENARIO, budget_mode: "spend", budget_value: 0.5 };
  expect(runCampaign(table, bySpend).k).toBe(0); // one call alone costs at least £1
});

test("half the expected value comes from the first customers of the list", () => {
  const campaign = runCampaign(table, DEFAULT_SCENARIO);
  const n = halfValueCount(campaign);
  expect(campaign.cumExpected[n]).toBeGreaterThanOrEqual(campaign.expected / 2);
  expect(campaign.cumExpected[n - 1]).toBeLessThan(campaign.expected / 2);
  const nobody = runCampaign(table, { ...DEFAULT_SCENARIO, gamma: 0 });
  expect(nobody.k).toBe(0);
  expect(halfValueCount(nobody)).toBe(0);
});

test("the list summary agrees with the full campaign, with and without a budget", () => {
  for (const scenario of [
    DEFAULT_SCENARIO,
    { ...DEFAULT_SCENARIO, budget_mode: "calls", budget_value: 2 } satisfies Scenario,
    { ...DEFAULT_SCENARIO, gamma: 0.9, lambda_c: 0.3 },
  ]) {
    const campaign = runCampaign(table, scenario);
    const summary = summarizeList(table, scenario);
    expect(summary.k).toBe(campaign.k);
    expect(summary.realized).toBeCloseTo(campaign.realizedTotal, 9);
  }
});
