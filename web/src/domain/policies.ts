/**
 * The policies compared on the Simulator (spec §5.2): call everyone, random at the deployed
 * model's size, every model in the manifest, and perfect foresight.
 */
import type { ModelInfo } from "@/contract/index.ts";
import type { Scenario } from "@/scenario/schema.ts";

import { scenarioEconomics, selectList } from "./campaign.ts";
import { expectedCost, expectedProfit, realizedProfit } from "./economics.ts";
import { type CustomerTable, probabilities } from "./table.ts";

export type PolicyKind = "everyone" | "random" | "model" | "oracle";

export interface PolicyResult {
  id: string; // "everyone", "random", "oracle" or a model name
  label: string;
  kind: PolicyKind;
  deployed: boolean;
  k: number;
  realized: number;
  mask: Uint8Array | null; // null for random, which is an expectation, not a list
}

export interface PolicyComparison {
  rows: PolicyResult[];
  contributions: Float64Array; // realized profit of calling each customer
  oracle: number;
  shareOfOracle: number | null; // deployed model's realized / perfect foresight's
}

function masked(values: Float64Array, mask: Uint8Array): number {
  let sum = 0;
  for (let i = 0; i < values.length; i++) if (mask[i] === 1) sum += values[i] as number;
  return sum;
}

function count(mask: Uint8Array): number {
  let k = 0;
  for (const v of mask) k += v;
  return k;
}

export function comparePolicies(
  table: CustomerTable,
  scenario: Scenario,
  models: ModelInfo[],
): PolicyComparison {
  const econ = scenarioEconomics(table, scenario);
  const contributions = realizedProfit(table.churn, econ, scenario);
  const n = table.n;
  const everyone = new Uint8Array(n).fill(1);
  const oracleMask = Uint8Array.from(contributions, (v, i) =>
    table.churn[i] === 1 && v > 0 ? 1 : 0,
  );
  const total = masked(contributions, everyone);

  const modelRows: PolicyResult[] = models.map((info) => {
    const p = probabilities(table, info.name);
    const mask = selectList(
      expectedProfit(p, econ, scenario),
      expectedCost(p, econ, scenario),
      scenario,
    );
    return {
      id: info.name,
      label: info.label,
      kind: "model",
      deployed: info.deployable,
      k: count(mask),
      realized: masked(contributions, mask),
      mask,
    };
  });
  const deployed = modelRows.find((row) => row.deployed);
  const kDeployed = deployed?.k ?? 0;
  const oracle = masked(contributions, oracleMask);
  const rows: PolicyResult[] = [
    {
      id: "everyone",
      label: "Call everyone",
      kind: "everyone",
      deployed: false,
      k: n,
      realized: total,
      mask: everyone,
    },
    {
      id: "random",
      label: "Random list, same size",
      kind: "random",
      deployed: false,
      k: kDeployed,
      realized: n > 0 ? (kDeployed / n) * total : 0,
      mask: null,
    },
    ...modelRows,
    {
      id: "oracle",
      label: "Perfect foresight",
      kind: "oracle",
      deployed: false,
      k: count(oracleMask),
      realized: oracle,
      mask: oracleMask,
    },
  ];
  return {
    rows,
    contributions,
    oracle,
    shareOfOracle: deployed && oracle > 0 ? deployed.realized / oracle : null,
  };
}
