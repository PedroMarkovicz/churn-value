// @vitest-environment node
/**
 * On the real artifacts (when `npm run artifacts` has installed them), the TypeScript campaign
 * must reproduce the Python evaluation: the same lists and profits at the default scenario.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateArtifact } from "@/contract/load.ts";
import { runCampaign } from "@/domain/campaign.ts";
import { comparePolicies } from "@/domain/policies.ts";
import { buildTable } from "@/domain/table.ts";
import { DEFAULT_SCENARIO, type Scenario } from "@/scenario/schema.ts";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const installed = existsSync(`${DATA}evaluation.json`);

function read(name: string): unknown {
  return JSON.parse(readFileSync(`${DATA}${name}.json`, "utf8"));
}

test.skipIf(!installed)("TypeScript policies reproduce the Python policy table", () => {
  const customers = validateArtifact("customers", read("customers"));
  const evaluation = validateArtifact("evaluation", read("evaluation"));
  const manifest = validateArtifact("manifest", read("manifest"));
  const scenario: Scenario = { ...DEFAULT_SCENARIO, ...evaluation.economics };
  const table = buildTable(customers);
  const comparison = comparePolicies(table, scenario, manifest.models);
  const python = new Map(evaluation.policies.map((row) => [row.policy, row]));
  const ids: [string, string][] = [
    ["everyone", "contact_all"],
    ["oracle", "oracle"],
    ...manifest.models.map((m): [string, string] => [m.name, m.name]),
  ];
  for (const [ours, theirs] of ids) {
    const row = comparison.rows.find((r) => r.id === ours);
    const reference = python.get(theirs);
    expect(row?.k, ours).toBe(reference?.n_contacted);
    expect(row?.realized, ours).toBeCloseTo(reference?.realized_profit ?? NaN, 6);
  }
  const campaign = runCampaign(table, scenario);
  const deployed = python.get(manifest.deployed_model);
  expect(campaign.expected).toBeCloseTo(deployed?.expected_profit ?? NaN, 6);
});
