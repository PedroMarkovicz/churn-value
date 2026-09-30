/** Sensitivity (spec §5.3): when does the campaign stop paying? */
import { useMemo, useState } from "react";

import { useAppData } from "@/components/layout/Layout.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { runCampaign } from "@/domain/campaign.ts";
import { sensitivityHeadline } from "@/domain/headlines.ts";
import { acceptanceLine, breakEvenAcceptance } from "@/domain/stress.ts";
import { useScenario } from "@/scenario/ScenarioProvider.tsx";
import { scenarioHash } from "@/scenario/schema.ts";
import { opportunity, stress, tornadoBars } from "@/workers/compute.ts";
import { useCompute } from "@/workers/useCompute.ts";

import { OpportunityMap, REPLACEMENT_OPTIONS } from "./OpportunityMap.tsx";
import { StressChart } from "./StressChart.tsx";
import { Tornado } from "./Tornado.tsx";

export function SensitivityPage() {
  const { table } = useAppData();
  const { scenario } = useScenario();
  const hash = scenarioHash(scenario);
  const campaign = useMemo(() => runCampaign(table, scenario), [table, scenario]);
  const line = useMemo(
    () => acceptanceLine(campaign, table, scenario),
    [campaign, table, scenario],
  );
  const breakEven = breakEvenAcceptance(line, campaign.k);

  const onMap = (REPLACEMENT_OPTIONS as readonly number[]).includes(scenario.lambda_a);
  const [lambdaA, setLambdaA] = useState<number>(onMap ? scenario.lambda_a : 10);

  const rebuilt = useCompute(
    `stress:${hash}`,
    (api) => api.stress(scenario),
    () => stress(table, scenario),
  );
  const bars = useCompute(
    `tornado:${hash}`,
    (api) => api.tornado(scenario),
    () => tornadoBars(table, scenario),
  );
  const map = useCompute(
    `map:${hash}:${lambdaA}`,
    (api) => api.opportunity(scenario, lambdaA),
    () => opportunity(table, scenario, lambdaA),
  );

  return (
    <>
      <PageHeading
        title={sensitivityHeadline(breakEven)}
        lede="Acceptance is the one number nobody can measure before a campaign runs. The list was built for the assumed rate; here is what it earns if the truth is different, and which assumption moves the result most."
      />
      <div className="grid gap-5">
        <StressChart
          line={line}
          breakEven={breakEven}
          assumed={scenario.gamma}
          rebuilt={rebuilt.value}
        />
        <div className="grid items-start gap-5 lg:grid-cols-[1.2fr_1fr]">
          <Tornado bars={bars.value} today={campaign.realizedTotal} />
          <OpportunityMap
            map={map.value}
            lambdaA={lambdaA}
            onLambdaA={setLambdaA}
            here={
              lambdaA === scenario.lambda_a
                ? { gamma: scenario.gamma, lambdaC: scenario.lambda_c }
                : null
            }
          />
        </div>
      </div>
    </>
  );
}
