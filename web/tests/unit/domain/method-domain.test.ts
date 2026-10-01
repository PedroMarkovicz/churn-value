import {
  assumptionRows,
  calendarTitle,
  overallRatio,
  validationCalendar,
  valueBars,
  valueNote,
  valueTitle,
} from "@/domain/method.ts";
import { DEFAULT_SCENARIO } from "@/scenario/schema.ts";

import { evaluationFixture } from "../fixtures/artifacts.ts";

const evaluation = evaluationFixture();
const cutoffs = [...new Set([...evaluation.drift, ...evaluation.stability].map((r) => r.cutoff))];

test("the calendar gives every cutoff a stage and its 90-day outcome window", () => {
  const rows = validationCalendar(evaluation.split, cutoffs, 90);
  expect(rows).toHaveLength(16);
  expect(rows.filter((r) => r.stage === "train")).toHaveLength(10);
  expect(rows.map((r) => r.stage).slice(10)).toEqual([
    "gap",
    "gap",
    "calibration",
    "gap",
    "gap",
    "test",
  ]);
  expect(rows.find((r) => r.stage === "test")).toEqual({
    cutoff: "2011-09-10",
    stage: "test",
    outcomeEnd: "2011-12-09",
  });
  expect(calendarTitle(rows)).toBe(
    "Learn from 10 past months, calibrate on June, judge on September",
  );
  expect(calendarTitle([])).toBe("This release has no validation calendar");
});

test("value bars label the buckets in words, and the title follows the overall ratio", () => {
  const bars = valueBars(evaluation.value_check);
  expect(bars.map((b) => b.label)).toEqual([
    "2 purchase days",
    "3 purchase days",
    "4–5 purchase days",
    "6–10 purchase days",
    "11 or more purchase days",
  ]);
  expect(overallRatio(bars)).toBeCloseTo(3820 / 5000, 12);
  expect(valueTitle(bars)).toBe("The value estimate is conservative");
  expect(valueNote(bars)).toBe(
    "Only customers with 2 purchase days are overstated, by 33%; the list marks them.",
  );
});

test("a value backtest that runs high, or is missing, says so", () => {
  const high = valueBars(evaluation.value_check).map((b) => ({
    ...b,
    predicted: b.actual * 1.2,
    ratio: 1.2,
  }));
  expect(valueTitle(high)).toBe("The value estimate runs high");
  expect(valueNote(high)).toBe("Every bucket is overstated.");
  expect(valueTitle(valueBars(null))).toBe("This release has no value backtest");
  expect(valueTitle(valueBars(undefined))).toBe("This release has no value backtest");
  const none = valueBars(evaluation.value_check).map((b) => ({ ...b, ratio: 0.9 }));
  expect(valueNote(none)).toBe("No bucket is overstated.");
  const nullRatio = valueBars([
    {
      bucket: "2",
      min_purchase_days: 2,
      max_purchase_days: 2,
      n: 0,
      predicted_revenue: 0,
      actual_revenue: 0,
      ratio: null,
    },
  ]);
  expect(valueNote(nullRatio)).toBe("No bucket was measured.");
  expect(valueTitle(nullRatio)).toBe("This release has no value backtest");
});

test("the assumptions table names each parameter with its symbol, value, range and source", () => {
  const rows = assumptionRows(DEFAULT_SCENARIO);
  expect(rows.map((r) => r.symbol)).toEqual(["γ", "λc", "λa", "m", "c", "T"]);
  expect(rows[0]).toMatchObject({ name: "Acceptance", value: "30%", range: "0% to 100%" });
  for (const row of rows) expect(row.source.length).toBeGreaterThan(10);
});

test("unmeasured buckets are named, never counted as not overstated", () => {
  const bars = valueBars(evaluation.value_check).map((b, i) =>
    i === 0 ? b : { ...b, ratio: null },
  );
  expect(valueNote(bars)).toBe(
    "Every measured bucket is overstated. Not measured: 3 purchase days, 4–5 purchase days, 6–10 purchase days, 11 or more purchase days.",
  );
  const two = valueBars(evaluation.value_check).map((b, i) => (i < 2 ? b : { ...b, ratio: null }));
  expect(valueNote(two)).toBe(
    "Only customers with 2 purchase days are overstated, by 33%; the list marks them. Not measured: 4–5 purchase days, 6–10 purchase days, 11 or more purchase days.",
  );
  const none = valueBars(evaluation.value_check).map((b) => ({ ...b, ratio: null }));
  expect(valueNote(none)).toBe("No bucket was measured.");
});
