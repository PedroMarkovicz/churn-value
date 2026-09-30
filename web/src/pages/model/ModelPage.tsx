/** Model (spec §5.5): can the probabilities be trusted? Results at the default scenario. */
import { FixedScenario } from "@/components/layout/FixedScenario.tsx";
import { useAppData } from "@/components/layout/Layout.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { monthName } from "@/domain/customerText.ts";
import { calibrationSeries, modelHeadline, promiseRows } from "@/domain/model.ts";

import { CalibrationOverTime } from "./CalibrationOverTime.tsx";
import { PromiseReality } from "./PromiseReality.tsx";

export function ModelPage() {
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
      <div className="grid gap-7">
        <CalibrationOverTime
          series={series}
          missing={missing}
          calibrationCutoff={calibration}
          testCutoff={test}
        />
        <PromiseReality rows={promiseRows(evaluation, manifest.models)} testCutoff={test} />
      </div>
    </>
  );
}
