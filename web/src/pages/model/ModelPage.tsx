/** Model (spec §5.5): can the probabilities be trusted? Results at the default scenario. */
import { FixedScenario } from "@/components/layout/FixedScenario.tsx";
import { useAppData } from "@/components/layout/Layout.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import type { ExperimentsFile } from "@/contract/index.ts";
import { monthName } from "@/domain/customerText.ts";
import { calibrationSeries, modelHeadline, promiseRows } from "@/domain/model.ts";

import { CalibrationOverTime } from "./CalibrationOverTime.tsx";
import { DriftMap } from "./DriftMap.tsx";
import { PromiseReality } from "./PromiseReality.tsx";
import { RankAlike } from "./RankAlike.tsx";
import { Reliability } from "./Reliability.tsx";
import { RunStrip } from "./RunStrip.tsx";

export function ModelPage({ experiments }: { experiments: ExperimentsFile }) {
  const { evaluation, manifest } = useAppData();
  const { series, missing } = calibrationSeries(evaluation, manifest.models);
  const { test, calibration } = evaluation.split;
  return (
    <>
      <PageHeading
        title={modelHeadline(evaluation, manifest.deployed_model)}
        lede={`Money depends on the probabilities, not only on the ranking: every list is priced with them. These charts compare every model in the ladder on the months after training and on the ${monthName(test)} ${test.slice(0, 4)} holdout.`}
      />
      <FixedScenario economics={evaluation.economics} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-7">
        <CalibrationOverTime
          series={series}
          missing={missing}
          calibrationCutoff={calibration}
          testCutoff={test}
        />
        <PromiseReality rows={promiseRows(evaluation, manifest.models)} testCutoff={test} />
        <div className="grid items-start gap-7 lg:grid-cols-2">
          <RankAlike evaluation={evaluation} models={manifest.models} testCutoff={test} />
          <Reliability
            evaluation={evaluation}
            models={manifest.models}
            deployed={manifest.deployed_model}
            testCutoff={test}
          />
        </div>
        <DriftMap drift={evaluation.drift} />
        <RunStrip manifest={manifest} experiments={experiments} />
      </div>
    </>
  );
}
