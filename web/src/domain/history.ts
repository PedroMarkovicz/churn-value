/**
 * Purchase history (spec §5.4, item 5). Days are relative to the cutoff: negative before it, and
 * (0, horizon] is the outcome window, which stays hidden until the page reveals outcomes.
 */
import type { Timeline, TimelinesFile } from "@/contract/index.ts";

import { count, days } from "./format.ts";

export interface Purchase {
  day: number;
  revenue: number;
}

export function indexTimelines(file: TimelinesFile): ReadonlyMap<number, Timeline> {
  return new Map(file.timelines.map((timeline) => [timeline.customer_id, timeline]));
}

export function visiblePurchases(timeline: Timeline, revealed: boolean): Purchase[] {
  return timeline.days
    .map((day, i) => ({ day, revenue: timeline.revenue[i] ?? 0 }))
    .filter((purchase) => revealed || purchase.day <= 0);
}

export function outcomeLine(timeline: Timeline, churned: boolean, horizonDays: number): string {
  if (churned) return `Nothing bought in the ${count(horizonDays)} days after the cutoff: churned.`;
  const next = timeline.days.filter((day) => day > 0 && day <= horizonDays);
  if (next.length === 0) return "Stayed: bought again after the cutoff.";
  return `Bought again ${days(Math.min(...next))} after the cutoff: stayed.`;
}
