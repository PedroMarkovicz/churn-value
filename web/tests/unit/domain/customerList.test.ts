import { runCampaign } from "@/domain/campaign.ts";
import {
  type CustomerRow,
  customerRows,
  decisionCounts,
  DEFAULT_LIST,
  listView,
  nextSort,
} from "@/domain/customerList.ts";
import { buildTable } from "@/domain/table.ts";
import { DEFAULT_SCENARIO, type Scenario } from "@/scenario/schema.ts";

import { customerFixture, customersFixture, fixtureFeatures } from "../fixtures/artifacts.ts";
import { fixtureData } from "../render.tsx";

function rowsFor(scenario: Scenario = DEFAULT_SCENARIO, table = fixtureData().table) {
  return customerRows(table, runCampaign(table, scenario), scenario);
}

function first(rows: CustomerRow[]): CustomerRow {
  const row = rows[0];
  if (!row) throw new Error("no rows");
  return row;
}

const ids = (rows: CustomerRow[]) => rows.map((r) => r.id);

test("rows come in rank order with the decision under the scenario", () => {
  const rows = rowsFor();
  expect(ids(rows)).toEqual([1, 2, 3, 6, 4, 5]);
  expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6]);
  expect(rows.map((r) => r.decision)).toEqual(["call", "call", "call", "skip", "skip", "skip"]);
});

test("each row carries the economics of a call", () => {
  const row = first(rowsFor());
  const value = 0.35 * 100 * (365 / 30);
  const crc = 0.1 * value;
  expect(row.value).toBeCloseTo(value, 9);
  expect(row.incentive).toBeCloseTo(crc, 9);
  expect(row.replacement).toBeCloseTo(10 * crc, 9);
  expect(row.benefit).toBeCloseTo(value, 9); // min(V, CAC), and CAC = V here
  expect(row.expProfit).toBeCloseTo(0.8 * 0.3 * (value - crc) - 0.2 * crc - 1, 9);
  expect(row.breakEven).toBeCloseTo((crc + 1) / (0.3 * (value - crc) + crc), 9);
  expect(row).toMatchObject({
    id: 1,
    p: 0.8,
    churned: true,
    isUk: true,
    nPurchaseDays: 5,
    recencyDays: 20,
    cadenceDays: 30,
  });
});

test("a customer worth a call but beyond the budget is marked, not skipped", () => {
  const rows = rowsFor({ ...DEFAULT_SCENARIO, budget_mode: "calls", budget_value: 2 });
  expect(rows.map((r) => r.decision)).toEqual(["call", "call", "budget", "skip", "skip", "skip"]);
  expect(decisionCounts(rows)).toEqual({ call: 2, skip: 4, all: 6 });
});

test("the decision filter splits Call from everything else", () => {
  const rows = rowsFor({ ...DEFAULT_SCENARIO, budget_mode: "calls", budget_value: 2 });
  expect(ids(listView(rows, DEFAULT_LIST))).toEqual([1, 2]);
  expect(ids(listView(rows, { ...DEFAULT_LIST, decision: "skip" }))).toEqual([3, 6, 4, 5]);
  expect(ids(listView(rows, { ...DEFAULT_LIST, decision: "all" }))).toHaveLength(6);
});

test("the country filter and the id search narrow the view", () => {
  const table = buildTable(
    customersFixture([
      customerFixture(1, 0.8, 1),
      customerFixture(2, 0.7, 0, 100, 30, {
        features: { ...fixtureFeatures(100, 30), is_uk: 0 },
      }),
      customerFixture(13, 0.6, 1),
    ]),
  );
  const rows = rowsFor(DEFAULT_SCENARIO, table);
  const all = { ...DEFAULT_LIST, decision: "all" as const };
  expect(ids(listView(rows, { ...all, country: "outside" }))).toEqual([2]);
  expect(ids(listView(rows, { ...all, country: "uk" }))).toEqual([1, 13]);
  expect(ids(listView(rows, { ...all, query: "1" }))).toEqual([1, 13]);
  expect(ids(listView(rows, { ...all, query: " 13 " }))).toEqual([13]);
  expect(listView(rows, { ...all, query: "abc" })).toEqual([]);
});

test("sorting keeps rank as the tie-breaker and never mutates the rows", () => {
  const rows = rowsFor();
  const before = ids(rows);
  const all = { ...DEFAULT_LIST, decision: "all" as const };
  expect(ids(listView(rows, { ...all, sort: "p", descending: true }))).toEqual([1, 2, 3, 6, 4, 5]);
  expect(ids(listView(rows, { ...all, sort: "p", descending: false }))).toEqual([5, 4, 6, 3, 2, 1]);
  expect(ids(listView(rows, { ...all, sort: "rank", descending: true }))).toEqual([
    5, 4, 6, 3, 2, 1,
  ]);
  expect(ids(rows)).toEqual(before);
});

test("clicking a column sorts it, clicking it again flips it", () => {
  const byP = nextSort(DEFAULT_LIST, "p");
  expect(byP).toMatchObject({ sort: "p", descending: true });
  expect(nextSort(byP, "p")).toMatchObject({ sort: "p", descending: false });
  expect(nextSort(byP, "rank")).toMatchObject({ sort: "rank", descending: false });
});
