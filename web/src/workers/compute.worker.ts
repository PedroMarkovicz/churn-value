/// <reference lib="webworker" />
import * as Comlink from "comlink";

import { loadArtifact } from "@/contract/load.ts";
import { buildTable, type CustomerTable } from "@/domain/table.ts";
import type { ModelInfo } from "@/contract/index.ts";
import type { Scenario } from "@/scenario/schema.ts";

import { opportunity, policyIntervals, stress, tornadoBars } from "./compute.ts";

// The worker reads customers.json itself (the browser cache serves it) instead of receiving
// the table from the page, so nothing large crosses the thread boundary.
let table: Promise<CustomerTable> | null = null;
const customers = () => (table ??= loadArtifact("customers").then(buildTable));

const api = {
  async policyIntervals(scenario: Scenario, models: ModelInfo[]) {
    return policyIntervals(await customers(), scenario, models);
  },
  async stress(scenario: Scenario) {
    return stress(await customers(), scenario);
  },
  async opportunity(scenario: Scenario, lambdaA: number) {
    return opportunity(await customers(), scenario, lambdaA);
  },
  async tornado(scenario: Scenario) {
    return tornadoBars(await customers(), scenario);
  },
};

export type ComputeApi = typeof api;
Comlink.expose(api);
