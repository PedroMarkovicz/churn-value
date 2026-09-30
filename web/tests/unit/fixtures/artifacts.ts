/**
 * Small, valid artifacts built in code. Unit tests never read the real (git-ignored) data; the
 * fixture test validates every builder against the generated validators.
 */
import type {
  Customer,
  CustomersFile,
  FeatureEntry,
  FeatureSpec,
  Manifest,
  ModelInfo,
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
