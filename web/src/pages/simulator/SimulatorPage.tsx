/** Simulator (spec §5.2): how many should we call, under my assumptions? */
import { useMemo } from "react";

import { useAppData } from "@/components/layout/Layout.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { Controls } from "@/components/scenario/Controls.tsx";
import { runCampaign, summarizeList } from "@/domain/campaign.ts";
import { simulatorHeadline } from "@/domain/headlines.ts";
import { comparePolicies } from "@/domain/policies.ts";
import { useScenario } from "@/scenario/ScenarioProvider.tsx";
import { scenarioHash } from "@/scenario/schema.ts";
import { policyIntervals } from "@/workers/compute.ts";
import { useCompute } from "@/workers/useCompute.ts";

import { PolicyBars } from "./PolicyBars.tsx";
import { ProfitCurve } from "./ProfitCurve.tsx";

export function SimulatorPage() {
  const { table, manifest } = useAppData();
  const { scenario } = useScenario();
  const campaign = useMemo(() => runCampaign(table, scenario), [table, scenario]);
  const comparison = useMemo(
    () => comparePolicies(table, scenario, manifest.models),
    [table, scenario, manifest.models],
  );
  const intervals = useCompute(
    `intervals:${scenarioHash(scenario)}`,
    (api) => api.policyIntervals(scenario, manifest.models),
    () => policyIntervals(table, scenario, manifest.models),
  );

  return (
    <>
      <PageHeading
        title={simulatorHeadline(
          scenario,
          campaign.k,
          campaign.expected,
          campaign.realizedTotal,
          summarizeList(table, { ...scenario, budget_mode: "none" }).k,
        )}
        lede="Customers are ranked by what a call is expected to earn. The list stops where the next call is expected to lose money, or where the budget runs out."
      />
      <div className="grid items-start gap-5 lg:grid-cols-[280px_1fr]">
        <aside
          aria-label="Assumptions"
          className="rounded-[10px] bg-panel p-5 shadow-[0_0_0_1px_var(--color-rule)] lg:sticky lg:top-4"
        >
          <Controls />
        </aside>
        <div className="grid min-w-0 gap-5">
          <ProfitCurve campaign={campaign} n={table.n} />
          <PolicyBars
            comparison={comparison}
            intervals={intervals.value}
            pending={intervals.pending}
          />
        </div>
      </div>
    </>
  );
}
