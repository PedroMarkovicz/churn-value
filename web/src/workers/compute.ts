/**
 * The heavier computations (spec §6.4), as pure functions of the table and the scenario. The
 * worker runs them off the main thread; without a worker they run here unchanged.
 */
import type { ModelInfo } from "@/contract/index.ts";
import { bootstrapIntervals, type Interval } from "@/domain/bootstrap.ts";
import { comparePolicies } from "@/domain/policies.ts";
import {
  opportunityMap,
  type OpportunityMap,
  type StressPoint,
  steps,
  tornado,
  type TornadoBar,
} from "@/domain/stress.ts";
import { acceptanceLine } from "@/domain/stress.ts";
import { runCampaign } from "@/domain/campaign.ts";
import { stressCurve } from "@/domain/stress.ts";
import type { CustomerTable } from "@/domain/table.ts";
import type { Scenario } from "@/scenario/schema.ts";

export const BOOTSTRAP_SAMPLES = 1000;
export const BOOTSTRAP_SEED = 42;
export const MAP_GAMMAS = steps(0, 1, 0.05);
export const MAP_LAMBDA_CS = steps(0, 0.5, 0.025);
export const STRESS_GAMMAS = steps(0, 1, 0.01);

/** 95 % customer-bootstrap interval of every policy that is a list (random has none). */
export function policyIntervals(
  table: CustomerTable,
  scenario: Scenario,
  models: ModelInfo[],
): Record<string, Interval> {
  const comparison = comparePolicies(table, scenario, models);
  const lists = comparison.rows.filter((row) => row.mask !== null);
  const intervals = bootstrapIntervals(
    comparison.contributions,
    lists.map((row) => row.mask as Uint8Array),
    BOOTSTRAP_SAMPLES,
    BOOTSTRAP_SEED,
  );
  return Object.fromEntries(lists.map((row, i) => [row.id, intervals[i] as Interval]));
}

export function stress(table: CustomerTable, scenario: Scenario): StressPoint[] {
  const campaign = runCampaign(table, scenario);
  return stressCurve(table, scenario, acceptanceLine(campaign, table, scenario), STRESS_GAMMAS);
}

export function opportunity(
  table: CustomerTable,
  scenario: Scenario,
  lambdaA: number,
): OpportunityMap {
  return opportunityMap(table, { ...scenario, lambda_a: lambdaA }, MAP_GAMMAS, MAP_LAMBDA_CS);
}

export function tornadoBars(table: CustomerTable, scenario: Scenario): TornadoBar[] {
  return tornado(table, scenario);
}
