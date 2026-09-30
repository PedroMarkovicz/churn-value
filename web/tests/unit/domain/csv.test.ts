import { runCampaign } from "@/domain/campaign.ts";
import { csvFileName, customersCsv } from "@/domain/csv.ts";
import { customerRows } from "@/domain/customerList.ts";
import { DEFAULT_SCENARIO, type Scenario, scenarioHash } from "@/scenario/schema.ts";

import { fixtureData } from "../render.tsx";

function rowsFor(scenario: Scenario = DEFAULT_SCENARIO) {
  const { table } = fixtureData();
  return customerRows(table, runCampaign(table, scenario), scenario);
}

const HEADER =
  "rank,customer_id,decision,p_churn,value,incentive,replacement_cost,benefit,expected_profit,break_even_p,recency_days,n_purchase_days,cadence_days,is_uk";

test("the CSV has the documented columns and one line per row in view", () => {
  const lines = customersCsv(rowsFor().slice(0, 2), false).trimEnd().split("\n");
  expect(lines[0]).toBe(HEADER);
  expect(lines).toHaveLength(3);
  expect(lines[1]?.split(",")).toEqual([
    "1",
    "1",
    "call",
    "0.800000",
    "425.83",
    "42.58",
    "425.83",
    "425.83",
    "82.46",
    expect.stringMatching(/^0\.27\d{4}$/),
    "20",
    "5",
    "30.00",
    "1",
  ]);
});

test("the outcome column appears only when outcomes are revealed", () => {
  const hidden = customersCsv(rowsFor(), false);
  expect(hidden).not.toContain("outcome");
  const lines = customersCsv(rowsFor(), true).trimEnd().split("\n");
  expect(lines[0]).toBe(`${HEADER},outcome`);
  expect(lines[1]).toMatch(/,churned$/); // customer 1 churned
  expect(lines[2]).toMatch(/,stayed$/); // customer 2 stayed
});

test("a customer beyond the budget is written as over_budget", () => {
  const rows = rowsFor({ ...DEFAULT_SCENARIO, budget_mode: "calls", budget_value: 2 });
  expect(customersCsv(rows, false).split("\n")[3]?.split(",")[2]).toBe("over_budget");
});

test("an undefined break-even is left empty, never Infinity or NaN", () => {
  const text = customersCsv(
    rowsFor({ ...DEFAULT_SCENARIO, gamma: 0, lambda_c: 0, contact_cost: 1 }),
    false,
  );
  expect(text).not.toMatch(/Infinity|NaN/);
  expect(text.split("\n")[1]?.split(",")[9]).toBe("");
});

test("the file name carries the scenario", () => {
  expect(csvFileName(DEFAULT_SCENARIO)).toBe(
    `churn-value-customers-${scenarioHash(DEFAULT_SCENARIO)}.csv`,
  );
});
