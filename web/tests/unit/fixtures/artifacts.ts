/**
 * Small, valid artifacts built in code. Unit tests never read the real (git-ignored) data; the
 * fixture test validates every builder against the generated validators.
 */
import type {
  Customer,
  CustomersFile,
  EvaluationFile,
  ExperimentsFile,
  FeatureEntry,
  FeatureSpec,
  Manifest,
  ModelInfo,
  StabilityRow,
  TimelinesFile,
} from "@/contract/index.ts";

export const MODELS: ModelInfo[] = [
  { name: "rule_a", label: "Rule A", family: "rule", deployable: false },
  { name: "gbdt_b", label: "GBDT B", family: "gbdt", deployable: true },
];

export function manifestFixture(overrides: Partial<Manifest> = {}): Manifest {
  return {
    contract_version: "1.2.0",
    created_at: "2026-09-27T12:00:00Z",
    git_sha: "0123456789abcdef0123456789abcdef01234567",
    data_sha256: "572e36277c2390fbfde10664750731e0a86f55e33470d91919085f0408e67bfb",
    config_sha256: "b94e3e86505dae761c10b77babf5497cc6d3625ccb2c027a0a7dccb79df0f98d",
    deployed_model: "gbdt_b",
    test_cutoff: "2011-09-10",
    models: MODELS,
    files: { "customers.json": "0".repeat(64) },
    pipeline: { seed: 42, n_trials: 40, n_folds: 5, horizon_days: 90, eligibility_f: 0.5 },
    ...overrides,
  };
}

/**
 * The 19 model inputs of a customer who buys every `cadenceDays` and last bought 20 days before
 * the cutoff: every what-if consistency rule holds and the derived features match their formulas.
 */
export function fixtureFeatures(aov: number, cadenceDays: number): Record<string, number> {
  const recency = 20;
  const n = 5;
  return {
    recency_days: recency,
    n_purchase_days: n,
    tenure_days: recency + cadenceDays * (n - 1),
    total_spend: aov * n,
    avg_order_value: aov,
    n_distinct_products: 40,
    return_rate: 0,
    spend_90d: aov,
    spend_prev_90d: aov,
    purchases_90d: 1,
    cadence_cv: 0.3,
    bought_same_window_last_year: 1,
    is_uk: 1,
    cadence_days: cadenceDays,
    overdue_ratio: recency / cadenceDays,
    expected_purchases_h: 90 / cadenceDays,
    spend_trend: aov / (aov + 1),
    cutoff_month_sin: -1,
    cutoff_month_cos: 0,
  };
}

/** One customer; `p` gives the deployed model's probability, the rule gets its complement. */
export function customerFixture(
  id: number,
  p: number,
  churn: 0 | 1,
  aovGG = 100,
  cadenceDays = 30,
  extra: Partial<Customer> = {},
): Customer {
  return {
    customer_id: id,
    churn,
    p: { rule_a: 1 - p, gbdt_b: p },
    features: fixtureFeatures(aovGG, cadenceDays),
    aov_gg: aovGG,
    cadence_days: cadenceDays,
    shap_baseline: -0.9,
    top_contributions: [
      { feature: "recency_days", value: 20, shap: -0.3 },
      { feature: "n_purchase_days", value: 5, shap: 0.2 },
      { feature: "spend_90d", value: aovGG, shap: -0.1 },
    ],
    ...extra,
  };
}

export function customersFixture(customers: Customer[]): CustomersFile {
  return {
    cutoff: "2011-09-10",
    horizon_days: 90,
    models: MODELS.map((m) => m.name),
    deployed_model: "gbdt_b",
    customers,
  };
}

type FeatureRow = [
  name: string,
  group: FeatureEntry["group"],
  unit: string,
  dtype: FeatureEntry["dtype"],
  min: number,
  max: number,
];

/** The served feature spec's inputs, in model order, with its ranges (rounded). */
const FEATURES: FeatureRow[] = [
  ["recency_days", "base", "days", "int", 0, 344],
  ["n_purchase_days", "base", "days", "int", 2, 197],
  ["tenure_days", "base", "days", "int", 3, 648],
  ["total_spend", "base", "£", "float", 24.35, 455498.09],
  ["avg_order_value", "base", "£", "float", 11.16, 19920.69],
  ["n_distinct_products", "base", "count", "int", 1, 2178],
  ["return_rate", "base", "share", "float", 0, 1],
  ["spend_90d", "base", "£", "float", 0, 105867.81],
  ["spend_prev_90d", "base", "£", "float", 0, 111745.85],
  ["purchases_90d", "base", "days", "int", 0, 47],
  ["cadence_cv", "base", "ratio", "float", 0, 2.31],
  ["bought_same_window_last_year", "base", "0/1", "int", 0, 1],
  ["is_uk", "base", "0/1", "int", 0, 1],
  ["cadence_days", "derived", "days", "float", 7, 364],
  ["overdue_ratio", "derived", "ratio", "float", 0, 7.43],
  ["expected_purchases_h", "derived", "count", "float", 0.25, 12.86],
  ["spend_trend", "derived", "ratio", "float", 0, 46097.22],
  ["cutoff_month_sin", "context", "-", "float", -1, 1],
  ["cutoff_month_cos", "context", "-", "float", -1, 1],
];

export function featureSpecFixture(): FeatureSpec {
  return {
    order: FEATURES.map(([name]) => name),
    features: FEATURES.map(([name, group, unit, dtype, min, max]) => ({
      name,
      group,
      unit,
      dtype,
      min,
      max,
      editable: group === "base",
      description: name.replaceAll("_", " "),
    })),
    horizon_days: 90,
    cadence_floor_days: 7,
    spend_trend_eps: 1,
    context: { cutoff_month_sin: -1, cutoff_month_cos: 0 },
    onnx_input: "features",
    onnx_output: "probabilities",
    gamma_gamma: { p: 2.18, q: 3.6, v: 476.5 },
  };
}

/**
 * Purchase days every `cadence_days` up to `recency_days` before the cutoff, each of `aov_gg`;
 * customers who stayed also bought 30 days after the cutoff (as in the data: churn = no purchase
 * in the 90 days after it).
 */
export function timelinesFixture(customers: Customer[]): TimelinesFile {
  return {
    cutoff: "2011-09-10",
    horizon_days: 90,
    timelines: customers.map((c) => {
      const n = c.features.n_purchase_days ?? 0;
      const recency = c.features.recency_days ?? 0;
      const days = Array.from(
        { length: n },
        (_, i) => -Math.round(recency + c.cadence_days * (n - 1 - i)),
      );
      if (c.churn === 0) days.push(30);
      return { customer_id: c.customer_id, days, revenue: days.map(() => c.aov_gg) };
    }),
  };
}

const CUTOFFS = [
  "2011-04-10",
  "2011-05-10",
  "2011-06-10",
  "2011-07-10",
  "2011-08-10",
  "2011-09-10",
];
// Calibration gap (mean p − churn) per cutoff: the rule drifts after June, the GBDT holds.
const GAPS: Record<string, number[]> = {
  rule_a: [0.02, 0.03, 0, 0.06, 0.1, 0.13],
  gbdt_b: [0.02, 0.03, 0, -0.018, -0.025, 0.008],
};

function estimate(value: number, half: number) {
  return { value, ci_low: value - half, ci_high: value + half };
}

function modelEvaluation(meanP: number, rocAuc: number) {
  return {
    calibrator: { method: "platt" as const, slope: 1, intercept: 0 },
    curves: {
      gains: { fraction: [0, 1], captured: [0, 1] },
      pr: { recall: [0, 1], precision: [1, 0.3] },
      roc: { fpr: [0, 1], tpr: [0, 1] },
      reliability: [
        { bin_low: 0, bin_high: 0.5, mean_p: 0.2, churn_rate: 0.18, n: 60 },
        { bin_low: 0.5, bin_high: 1, mean_p: 0.7, churn_rate: 0.72, n: 40 },
      ],
    },
    emp_per_customer: estimate(10, 3),
    mean_p: meanP,
    metrics: {
      roc_auc: estimate(rocAuc, 0.02),
      pr_auc: estimate(rocAuc - 0.2, 0.02),
      brier: estimate(0.2, 0.01),
      lift_at_10: estimate(2, 0.2),
    },
  };
}

export function evaluationFixture(): EvaluationFile {
  const role = (cutoff: string): StabilityRow["role"] =>
    cutoff === "2011-06-10" ? "calibration" : cutoff === "2011-09-10" ? "test" : "out_of_time";
  const stability: StabilityRow[] = CUTOFFS.flatMap((cutoff, i) =>
    MODELS.map((m) => ({
      cutoff,
      role: role(cutoff),
      model: m.name,
      n_customers: 1000,
      churn_rate: 0.4,
      mean_p: 0.4 + (GAPS[m.name]?.[i] ?? 0),
      roc_auc: 0.7,
      pr_auc: 0.5,
      brier: 0.2,
      n_contacted: 500,
      expected_profit: 1000,
      realized_profit: 900,
    })),
  );
  const policy = (name: string, expected: number | null, realized: number) => ({
    policy: name,
    n_contacted: 3,
    expected_profit: expected,
    realized_profit: realized,
    realized_profit_ci_low: realized - 5000,
    realized_profit_ci_high: realized + 5000,
    random_same_k_profit: 0,
    share_of_oracle: null,
  });
  const bucket = (b: string, min: number, max: number | null, ratio: number | null) => ({
    bucket: b,
    min_purchase_days: min,
    max_purchase_days: max,
    n: 100,
    predicted_revenue: 1000 * (ratio ?? 1),
    actual_revenue: 1000,
    ratio,
  });
  return {
    split: {
      train: [
        "2010-06-10",
        "2010-07-10",
        "2010-08-10",
        "2010-09-10",
        "2010-10-10",
        "2010-11-10",
        "2010-12-10",
        "2011-01-10",
        "2011-02-10",
        "2011-03-10",
      ],
      calibration: "2011-06-10",
      test: "2011-09-10",
    },
    calibration_population: { n_customers: 5, churn_rate: 0.4 },
    test_population: { n_customers: 6, churn_rate: 0.308 },
    economics: {
      margin: 0.35,
      lambda_c: 0.1,
      lambda_a: 10,
      gamma: 0.3,
      contact_cost: 1,
      value_horizon_days: 365,
    },
    models: { rule_a: modelEvaluation(0.44, 0.55), gbdt_b: modelEvaluation(0.316, 0.77) },
    policies: [
      policy("do_nothing", 0, 0),
      policy("contact_all", null, -128345),
      policy("rule_a", 50000, -20000),
      policy("gbdt_b", 25621, 23139),
      policy("oracle", null, 88558),
    ],
    stability,
    drift: [
      { cutoff: "2010-06-10", feature: "tenure_days", psi: 4.7 },
      { cutoff: "2011-09-10", feature: "tenure_days", psi: 0.3 },
      { cutoff: "2010-06-10", feature: "recency_days", psi: 0.05 },
      { cutoff: "2011-09-10", feature: "recency_days", psi: 0.12 },
      { cutoff: "2010-06-10", feature: "spend_90d", psi: 0 },
      { cutoff: "2011-09-10", feature: "spend_90d", psi: 0.02 },
    ],
    value_check: [
      bucket("2", 2, 2, 1.33),
      bucket("3", 3, 3, 0.47),
      bucket("4-5", 4, 5, 0.7),
      bucket("6-10", 6, 10, 0.65),
      bucket("11+", 11, null, 0.67),
    ],
  };
}

export function experimentsFixture(): ExperimentsFile {
  return {
    experiment: "churn-value",
    runs: [
      {
        run_id: "run-gbdt",
        model: "gbdt_b",
        started_at: "2026-09-30T01:43:35Z",
        tags: { git_sha: "0123456789abcdef0123456789abcdef01234567" },
        params: { num_leaves: "14", learning_rate: "0.01356535951542509" },
        metrics: { cv_log_loss: 0.6741, fold_roc_auc: 0.7952, fold_pr_auc: 0.732 },
        trial_cv_log_loss: Array.from({ length: 40 }, (_, i) => 0.7 - i / 1000),
      },
    ],
  };
}
