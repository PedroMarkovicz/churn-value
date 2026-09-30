import { indexTimelines, outcomeLine, visiblePurchases } from "@/domain/history.ts";

const stayed = { customer_id: 7, days: [-60, -30, 12, 40], revenue: [100, 200, 50, 80] };
const churned = { customer_id: 8, days: [-122, -40], revenue: [300, 20] };

test("purchases after the cutoff stay hidden until the outcome is revealed", () => {
  expect(visiblePurchases(stayed, false)).toEqual([
    { day: -60, revenue: 100 },
    { day: -30, revenue: 200 },
  ]);
  expect(visiblePurchases(stayed, true).map((p) => p.day)).toEqual([-60, -30, 12, 40]);
});

test("the outcome line says what happened in the horizon", () => {
  expect(outcomeLine(stayed, false, 90)).toBe("Bought again 12 days after the cutoff: stayed.");
  expect(outcomeLine(churned, true, 90)).toBe(
    "Nothing bought in the 90 days after the cutoff: churned.",
  );
});

test("timelines are indexed by customer id", () => {
  const index = indexTimelines({
    cutoff: "2011-09-10",
    horizon_days: 90,
    timelines: [stayed, churned],
  });
  expect(index.get(8)).toBe(churned);
  expect(index.get(9)).toBeUndefined();
});
