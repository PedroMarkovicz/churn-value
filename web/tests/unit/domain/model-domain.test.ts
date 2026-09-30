// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { ModelInfo } from "@/contract/index.ts";
import { validateArtifact } from "@/contract/load.ts";
import { featureName } from "@/domain/featureNames.ts";
import {
  calibrationSeries,
  calibrationTitle,
  driftMatrix,
  driftTitle,
  experimentRows,
  metricRows,
  metricTitle,
  modelHeadline,
  promiseRows,
  promiseTitle,
  psiLevel,
  reliabilityPoints,
  reliabilityTitle,
  runFacts,
  runSentence,
} from "@/domain/model.ts";

import {
  evaluationFixture,
  experimentsFixture,
  featureSpecFixture,
  manifestFixture,
  MODELS,
} from "../fixtures/artifacts.ts";

const evaluation = evaluationFixture();
const GBDT = MODELS[1] as ModelInfo;

test("every model input has plain words, and an unknown one reads as its name", () => {
  for (const name of featureSpecFixture().order) expect(featureName(name)).not.toContain("_");
  expect(featureName("tenure_days")).toBe("Days since first purchase");
  expect(featureName("new_signal")).toBe("new signal");
});

test("the headline compares the promise with the outcome, and credits it only when earned", () => {
  expect(modelHeadline(evaluation, "gbdt_b")).toBe(
    "The model promised 32% would leave and 31% did. That is why its profit held up.",
  );
  expect(modelHeadline(evaluation, "rule_a")).toBe(
    "The model promised 44% would leave and 31% did. Its profit fell short of the promise.",
  );
  expect(modelHeadline(evaluation, "missing")).toBe(
    "This release has no evaluation of the served model.",
  );
});

test("calibration gaps are series per model, in cutoff order, with roles", () => {
  const { series, missing } = calibrationSeries(evaluation, MODELS);
  expect(series.map((s) => s.model.name)).toEqual(["rule_a", "gbdt_b"]);
  expect(series[1]?.points.map((p) => p.gap)).toEqual(
    [0.02, 0.03, 0, -0.018, -0.025, 0.008].map((g) => expect.closeTo(g, 12)),
  );
  expect(series[1]?.points.map((p) => p.role)).toEqual([
    "out_of_time",
    "out_of_time",
    "calibration",
    "out_of_time",
    "out_of_time",
    "test",
  ]);
  expect(missing).toEqual([]);
  const extra = {
    name: "new_model",
    label: "New model",
    family: "gbdt",
    deployable: false,
  } as const;
  expect(calibrationSeries(evaluation, [...MODELS, extra]).missing).toEqual([extra]);
});

test("the calibration title names the models that stay inside the band after calibration", () => {
  const { series } = calibrationSeries(evaluation, MODELS);
  expect(calibrationTitle(series, "2011-06-10")).toBe("Only GBDT B stays calibrated after June");
  expect(calibrationTitle(series.slice(0, 1), "2011-06-10")).toBe(
    "No model stays within 3.5 points after June",
  );
  expect(calibrationTitle(series.slice(1), "2011-06-10")).toBe(
    "Every model stays within 3.5 points after June",
  );
  expect(calibrationTitle([], "2011-06-10")).toBe("This release has no calibration history");
});

test("promise rows compare expected and realized, and a non-positive promise is never kept", () => {
  const rows = promiseRows(evaluation, MODELS);
  expect(rows.map((r) => [r.model.name, r.expected, r.realized, r.kept])).toEqual([
    ["rule_a", 50000, -20000, false],
    ["gbdt_b", 25621, 23139, true],
  ]);
  expect(rows[1]?.shortfall).toBe(25621 - 23139);
  expect(promiseTitle(rows)).toBe("Only GBDT B made close to what it promised");
  expect(promiseTitle(rows.slice(0, 1))).toBe("No model made close to what it promised");
  expect(promiseTitle([])).toBe("This release has no promises to compare");
  const zero = {
    ...evaluation,
    policies: evaluation.policies.map((p) => ({ ...p, expected_profit: 0 })),
  };
  expect(promiseRows(zero, MODELS).every((r) => !r.kept)).toBe(true);
});

test("metric rows carry the interval, and the title says which models are alike", () => {
  const roc = metricRows(evaluation, MODELS, "roc_auc");
  expect(roc.map((r) => [r.model.name, r.value, r.low, r.high])).toEqual([
    ["rule_a", 0.55, expect.closeTo(0.53, 12), expect.closeTo(0.57, 12)],
    ["gbdt_b", 0.77, expect.closeTo(0.75, 12), expect.closeTo(0.79, 12)],
  ]);
  expect(metricTitle(roc, "roc_auc")).toBe("GBDT B is best on ROC-AUC");
  const close = roc.map((r) => ({ ...r, low: 0.5, high: 0.8 }));
  expect(metricTitle(close, "roc_auc")).toBe(
    "The top 2 are alike on ROC-AUC: their intervals overlap",
  );
  // Brier: lower is better
  const brier = metricRows(evaluation, MODELS, "brier").map((r, i) => ({
    ...r,
    value: i === 0 ? 0.25 : 0.15,
    low: i === 0 ? 0.24 : 0.14,
    high: i === 0 ? 0.26 : 0.16,
  }));
  expect(metricTitle(brier, "brier")).toBe("GBDT B is best on the Brier score");
  expect(metricTitle([], "roc_auc")).toBe("This release has no ROC-AUC to compare");
});

test("reliability drops empty bins and summarises the gap weighted by customers", () => {
  const points = reliabilityPoints(evaluation, "gbdt_b");
  expect(points).toHaveLength(2);
  expect(reliabilityTitle(points, "GBDT B")).toBe(
    "GBDT B: predicted matches observed, 2.0 points apart on average",
  );
  const withEmpty = structuredClone(evaluation);
  const gbdt = withEmpty.models.gbdt_b;
  if (!gbdt) throw new Error("no fixture model");
  gbdt.curves.reliability = [{ bin_low: 0, bin_high: 1, mean_p: 0.5, churn_rate: 0, n: 0 }];
  expect(reliabilityPoints(withEmpty, "gbdt_b")).toEqual([]);
  expect(reliabilityTitle([], "GBDT B")).toBe("There are no reliability bins for GBDT B");
  const far = points.map((p) => ({ ...p, observed: p.meanP - 0.1 }));
  expect(reliabilityTitle(far, "GBDT B")).toBe(
    "GBDT B: predicted and observed differ by 10.0 points on average",
  );
});

test("PSI levels follow the thresholds, and odd values fall to the lowest", () => {
  expect([0, 0.09, 0.1, 0.3, 0.6, 1, 4.7].map(psiLevel)).toEqual([0, 0, 1, 2, 3, 4, 4]);
  expect(psiLevel(Number.NaN)).toBe(0);
  expect(psiLevel(-1)).toBe(0);
});

test("the drift matrix puts the most shifted feature first and fills gaps with null", () => {
  const matrix = driftMatrix([
    ...evaluation.drift,
    { cutoff: "2011-01-10", feature: "tenure_days", psi: 1 },
  ]);
  expect(matrix.features).toEqual(["tenure_days", "recency_days", "spend_90d"]);
  expect(matrix.cutoffs).toEqual(["2010-06-10", "2011-01-10", "2011-09-10"]);
  expect(matrix.psi[1]).toEqual([0.05, null, 0.12]);
  expect(driftTitle(matrix)).toBe(
    "2 of 3 features hold; the largest shift is in days since first purchase",
  );
  expect(driftTitle(driftMatrix([]))).toBe("This release has no drift measurements");
});

test("the run is described from the manifest, and a 1.1 manifest says what it lacks", () => {
  const facts = runFacts(manifestFixture());
  expect(facts).toMatchObject({ trials: 40, seed: 42, folds: 5, contract: "1.2.0" });
  expect(runSentence(facts)).toBe("40 Optuna trials per model, seed 42, 5 rolling-origin folds");
  const old = runFacts(manifestFixture({ contract_version: "1.1.0", pipeline: null }));
  expect(runSentence(old)).toBe(
    "The run's settings are not in this release; contract 1.2.0 adds them.",
  );
});

test("experiment runs carry the model's label, rounded params and fold metrics", () => {
  const [run] = experimentRows(experimentsFixture(), MODELS);
  expect(run).toMatchObject({
    label: "GBDT B",
    cvLogLoss: 0.6741,
    foldRocAuc: 0.7952,
    foldPrAuc: 0.732,
    trials: 40,
  });
  expect(run?.params).toEqual([
    ["learning_rate", "0.01357"],
    ["num_leaves", "14"],
  ]);
});

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
test.skipIf(!existsSync(`${DATA}evaluation.json`))(
  "on the pinned release the titles say what the numbers show",
  () => {
    const real = validateArtifact(
      "evaluation",
      JSON.parse(readFileSync(`${DATA}evaluation.json`, "utf8")),
    );
    const manifest = validateArtifact(
      "manifest",
      JSON.parse(readFileSync(`${DATA}manifest.json`, "utf8")),
    );
    const deployed = manifest.models.find((m) => m.deployable);
    if (!deployed) throw new Error("no deployable model");
    expect(modelHeadline(real, deployed.name)).toBe(
      "The model promised 32% would leave and 31% did. That is why its profit held up.",
    );
    const { series } = calibrationSeries(real, manifest.models);
    expect(calibrationTitle(series, real.split.calibration)).toBe(
      `Only ${deployed.label} stays calibrated after June`,
    );
    expect(promiseTitle(promiseRows(real, manifest.models))).toBe(
      `Only ${deployed.label} made close to what it promised`,
    );
    expect(metricTitle(metricRows(real, manifest.models, "roc_auc"), "roc_auc")).toBe(
      "The top 3 are alike on ROC-AUC: their intervals overlap",
    );
    expect(driftMatrix(real.drift).features[0]).toBe("tenure_days");
  },
);
