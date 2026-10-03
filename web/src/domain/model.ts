/**
 * The Model page (spec §5.5) as rows and sentences: every chart's data and takeaway title come
 * from evaluation.json, experiments.json and the manifest. Models are data (manifest.models).
 */
import type {
  EvaluationFile,
  ExperimentsFile,
  Manifest,
  ModelInfo,
  StabilityRow,
} from "@/contract/index.ts";

import { monthName } from "./customerText.ts";
import { featureName } from "./featureNames.ts";
import { count, percent } from "./format.ts";

/** ±3.5 points: the band inside which a model counts as calibrated (spec §5.5). */
export const CALIBRATION_BAND = 0.035;
/** A promise is kept when the list made at least this share of what it expected. */
export const KEPT_SHARE = 0.8;

const positionOf = (models: readonly ModelInfo[], name: string) =>
  models.findIndex((m) => m.name === name);

// --- headline ---------------------------------------------------------------------------------

export function modelHeadline(evaluation: EvaluationFile, deployed: string): string {
  const model = evaluation.models[deployed];
  if (!model) return "This release has no evaluation of the served model.";
  const actual = evaluation.test_population.churn_rate;
  const head = `The model promised ${percent(model.mean_p)} would leave and ${percent(actual)} did.`;
  const policy = evaluation.policies.find((p) => p.policy === deployed);
  const expected = policy?.expected_profit ?? null;
  const kept =
    policy !== undefined &&
    expected !== null &&
    expected > 0 &&
    policy.realized_profit >= KEPT_SHARE * expected;
  if (kept && Math.abs(model.mean_p - actual) <= CALIBRATION_BAND) {
    return `${head} That is why its profit held up.`;
  }
  if (policy !== undefined && expected !== null && expected > 0 && !kept) {
    return `${head} Its profit fell short of the promise.`;
  }
  return head;
}

// --- calibration over time --------------------------------------------------------------------

export interface GapPoint {
  cutoff: string;
  gap: number; // mean predicted − actual churn, as a fraction
  role: StabilityRow["role"];
}

export interface GapSeries {
  model: ModelInfo;
  position: number; // in the ladder: the colour slot
  points: GapPoint[];
}

export function calibrationSeries(
  evaluation: EvaluationFile,
  models: readonly ModelInfo[],
): { series: GapSeries[]; missing: ModelInfo[] } {
  const series: GapSeries[] = [];
  const missing: ModelInfo[] = [];
  models.forEach((model, position) => {
    const points = evaluation.stability
      .filter((row) => row.model === model.name)
      .sort((a, b) => a.cutoff.localeCompare(b.cutoff))
      .map((row) => ({ cutoff: row.cutoff, gap: row.mean_p - row.churn_rate, role: row.role }));
    if (points.length === 0) missing.push(model);
    else series.push({ model, position, points });
  });
  return { series, missing };
}

export function calibrationTitle(series: readonly GapSeries[], calibrationCutoff: string): string {
  if (series.length === 0) return "This release has no calibration history";
  const month = monthName(calibrationCutoff);
  const after = (s: GapSeries) => s.points.filter((p) => p.cutoff > calibrationCutoff);
  if (series.every((s) => after(s).length === 0))
    return `This release has no cutoffs after ${month}`;
  // A model with nothing measured after calibration has kept nothing.
  const kept = series.filter(
    (s) => after(s).length > 0 && after(s).every((p) => Math.abs(p.gap) <= CALIBRATION_BAND),
  );
  if (kept.length === series.length) return `Every model stays within 3.5 points after ${month}`;
  if (kept.length === 0) return `No model stays within 3.5 points after ${month}`;
  if (kept.length === 1)
    return `Only ${kept[0]?.model.label ?? ""} stays calibrated after ${month}`;
  return `${count(kept.length)} of ${count(series.length)} models stay calibrated after ${month}`;
}

// --- promise against reality ------------------------------------------------------------------

export interface PromiseRow {
  model: ModelInfo;
  position: number;
  expected: number;
  realized: number;
  low: number; // 95 % interval of the realized profit
  high: number;
  shortfall: number; // expected − realized
  kept: boolean;
}

export function promiseRows(
  evaluation: EvaluationFile,
  models: readonly ModelInfo[],
): PromiseRow[] {
  return models.flatMap((model) => {
    const row = evaluation.policies.find((p) => p.policy === model.name);
    if (!row || row.expected_profit === null) return [];
    const expected = row.expected_profit;
    return [
      {
        model,
        position: positionOf(models, model.name),
        expected,
        realized: row.realized_profit,
        low: row.realized_profit_ci_low,
        high: row.realized_profit_ci_high,
        shortfall: expected - row.realized_profit,
        kept: expected > 0 && row.realized_profit >= KEPT_SHARE * expected,
      },
    ];
  });
}

export function promiseTitle(rows: readonly PromiseRow[]): string {
  if (rows.length === 0) return "This release has no promises to compare";
  const kept = rows.filter((r) => r.kept);
  if (kept.length === 0) return "No model made close to what it promised";
  if (kept.length === 1) return `Only ${kept[0]?.model.label ?? ""} made close to what it promised`;
  return `${count(kept.length)} models made close to what they promised`;
}

// --- ranking metrics --------------------------------------------------------------------------

export type MetricKey = "roc_auc" | "pr_auc" | "brier" | "lift_at_10";

export const METRICS: Record<
  MetricKey,
  { label: string; phrase: string; higherIsBetter: boolean; digits: number }
> = {
  roc_auc: { label: "ROC-AUC", phrase: "ROC-AUC", higherIsBetter: true, digits: 3 },
  pr_auc: { label: "PR-AUC", phrase: "PR-AUC", higherIsBetter: true, digits: 3 },
  brier: { label: "Brier score", phrase: "the Brier score", higherIsBetter: false, digits: 3 },
  lift_at_10: { label: "Lift at 10%", phrase: "lift at 10%", higherIsBetter: true, digits: 2 },
};

export interface MetricRow {
  model: ModelInfo;
  position: number;
  value: number;
  low: number;
  high: number;
}

export function metricRows(
  evaluation: EvaluationFile,
  models: readonly ModelInfo[],
  key: MetricKey,
): MetricRow[] {
  return models.flatMap((model, position) => {
    const estimate = evaluation.models[model.name]?.metrics[key];
    if (!estimate) return [];
    return [
      { model, position, value: estimate.value, low: estimate.ci_low, high: estimate.ci_high },
    ];
  });
}

export function metricTitle(rows: readonly MetricRow[], key: MetricKey): string {
  const metric = METRICS[key];
  if (rows.length === 0) return `This release has no ${metric.label} to compare`;
  // phrase: inside a sentence ("best on the Brier score"); label: on its own ("Brier score")
  const better = (a: MetricRow, b: MetricRow) =>
    metric.higherIsBetter ? a.value > b.value : a.value < b.value;
  const best = rows.reduce((top, row) => (better(row, top) ? row : top));
  const alike = rows.filter((row) => row.low <= best.high && row.high >= best.low);
  if (alike.length >= 2) {
    return `The top ${count(alike.length)} are alike on ${metric.phrase}: their intervals overlap`;
  }
  return `${best.model.label} is best on ${metric.phrase}`;
}

// --- reliability ------------------------------------------------------------------------------

export interface ReliabilityPoint {
  low: number;
  high: number;
  meanP: number;
  observed: number;
  n: number;
}

export function reliabilityPoints(evaluation: EvaluationFile, model: string): ReliabilityPoint[] {
  return (evaluation.models[model]?.curves.reliability ?? [])
    .filter((bin) => bin.n > 0)
    .map((bin) => ({
      low: bin.bin_low,
      high: bin.bin_high,
      meanP: bin.mean_p,
      observed: bin.churn_rate,
      n: bin.n,
    }));
}

export function reliabilityTitle(points: readonly ReliabilityPoint[], label: string): string {
  const total = points.reduce((sum, p) => sum + p.n, 0);
  if (total === 0) return `There are no reliability bins for ${label}`;
  const gap = points.reduce((sum, p) => sum + p.n * Math.abs(p.meanP - p.observed), 0) / total;
  const apart = (gap * 100).toFixed(1);
  return gap <= CALIBRATION_BAND
    ? `${label}: predicted matches observed, ${apart} points apart on average`
    : `${label}: predicted and observed differ by ${apart} points on average`;
}

// --- drift ------------------------------------------------------------------------------------

/** PSI thresholds (spec §5.5): < 0.1 stable, then slight, moderate, large, and ≥ 1 severe. */
export const PSI_THRESHOLDS = [0.1, 0.25, 0.5, 1] as const;

export function psiLevel(psi: number): 0 | 1 | 2 | 3 | 4 {
  if (!(psi >= 0)) return 0;
  const level = PSI_THRESHOLDS.filter((t) => psi >= t).length;
  return level as 0 | 1 | 2 | 3 | 4;
}

export interface DriftMatrix {
  features: string[]; // most shifted first
  cutoffs: string[]; // chronological
  psi: (number | null)[][]; // [feature][cutoff]
}

export function driftMatrix(drift: EvaluationFile["drift"]): DriftMatrix {
  const cutoffs = [...new Set(drift.map((row) => row.cutoff))].sort();
  const peak = new Map<string, number>();
  for (const row of drift) peak.set(row.feature, Math.max(peak.get(row.feature) ?? 0, row.psi));
  const features = [...peak.keys()].sort((a, b) => (peak.get(b) ?? 0) - (peak.get(a) ?? 0));
  const psi = features.map((feature) =>
    cutoffs.map(
      (cutoff) =>
        drift.find((row) => row.feature === feature && row.cutoff === cutoff)?.psi ?? null,
    ),
  );
  return { features, cutoffs, psi };
}

export function driftTitle(matrix: DriftMatrix): string {
  if (matrix.features.length === 0) return "This release has no drift measurements";
  const shifted = matrix.psi.filter((row) =>
    row.some((v) => v !== null && v > (PSI_THRESHOLDS[1] as number)),
  );
  const hold = matrix.features.length - shifted.length;
  const name = featureName(matrix.features[0] ?? "");
  const top = name.charAt(0).toLowerCase() + name.slice(1); // "days since …", but "the UK" stays
  return `${count(hold)} of ${count(matrix.features.length)} features hold; the largest shift is in ${top}`;
}

// --- the run ----------------------------------------------------------------------------------

export interface RunFacts {
  trials: number | null;
  seed: number | null;
  folds: number | null;
  gitSha: string;
  dataSha: string;
  contract: string;
}

export function runFacts(manifest: Manifest): RunFacts {
  const pipeline = manifest.pipeline ?? null;
  return {
    trials: pipeline?.n_trials ?? null,
    seed: pipeline?.seed ?? null,
    folds: pipeline?.n_folds ?? null,
    gitSha: manifest.git_sha,
    dataSha: manifest.data_sha256,
    contract: manifest.contract_version,
  };
}

export function runSentence(facts: RunFacts): string {
  if (facts.trials === null || facts.seed === null || facts.folds === null) {
    return "The run's settings are not in this release; contract 1.2.0 adds them.";
  }
  return `${count(facts.trials)} Optuna trials per model, seed ${facts.seed}, ${count(facts.folds)} rolling-origin folds`;
}

export interface ExperimentRow {
  runId: string;
  label: string;
  startedAt: string;
  params: [string, string][];
  cvLogLoss: number | null;
  foldRocAuc: number | null;
  foldPrAuc: number | null;
  trials: number;
}

/** Four significant digits for numeric parameters; other values as logged. */
function param(value: string): string {
  const number = Number(value);
  return value.trim() !== "" && Number.isFinite(number)
    ? String(Number(number.toPrecision(4)))
    : value;
}

export function experimentRows(
  experiments: ExperimentsFile,
  models: readonly ModelInfo[],
): ExperimentRow[] {
  return experiments.runs.map((run) => ({
    runId: run.run_id,
    label: models.find((m) => m.name === run.model)?.label ?? run.model,
    startedAt: run.started_at,
    params: Object.entries(run.params)
      .filter(([name]) => name !== "n_features")
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, value]): [string, string] => [name, param(value)]),
    cvLogLoss: run.metrics.cv_log_loss ?? null,
    foldRocAuc: run.metrics.fold_roc_auc ?? null,
    foldPrAuc: run.metrics.fold_pr_auc ?? null,
    trials: run.trial_cv_log_loss.length,
  }));
}
