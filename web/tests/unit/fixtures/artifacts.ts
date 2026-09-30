/**
 * Small, valid artifacts built in code. Unit tests never read the real (git-ignored) data; the
 * fixture test validates every builder against the generated validators.
 */
import type {
  Customer,
  CustomersFile,
  FeatureSpec,
  Manifest,
  ModelInfo,
} from "@/contract/index.ts";

export const MODELS: ModelInfo[] = [
  { name: "rule_a", label: "Rule A", family: "rule", deployable: false },
  { name: "gbdt_b", label: "GBDT B", family: "gbdt", deployable: true },
];

export function manifestFixture(overrides: Partial<Manifest> = {}): Manifest {
  return {
    contract_version: "1.1.0",
    created_at: "2026-09-27T12:00:00Z",
    git_sha: "0123456789abcdef0123456789abcdef01234567",
    data_sha256: "572e36277c2390fbfde10664750731e0a86f55e33470d91919085f0408e67bfb",
    config_sha256: "b94e3e86505dae761c10b77babf5497cc6d3625ccb2c027a0a7dccb79df0f98d",
    deployed_model: "gbdt_b",
    test_cutoff: "2011-09-10",
    models: MODELS,
    files: { "customers.json": "0".repeat(64) },
    ...overrides,
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
    features: { n_purchase_days: 5, avg_order_value: aovGG, is_uk: 1 },
    aov_gg: aovGG,
    cadence_days: cadenceDays,
    shap_baseline: -0.9,
    top_contributions: [{ feature: "n_purchase_days", value: 5, shap: 0.1 }],
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

export function featureSpecFixture(): FeatureSpec {
  return {
    order: ["n_purchase_days", "avg_order_value", "is_uk"],
    features: [
      {
        name: "n_purchase_days",
        group: "base",
        unit: "days",
        description: "distinct days with a purchase",
        editable: true,
        dtype: "int",
        min: 2,
        max: 197,
      },
      {
        name: "avg_order_value",
        group: "base",
        unit: "£",
        description: "gross spend per purchase day",
        editable: true,
        dtype: "float",
        min: 1,
        max: 10000,
      },
      {
        name: "is_uk",
        group: "base",
        unit: "flag",
        description: "customer is in the United Kingdom",
        editable: true,
        dtype: "int",
        min: 0,
        max: 1,
      },
    ],
    horizon_days: 90,
    cadence_floor_days: 7,
    spend_trend_eps: 1,
    context: { cutoff_month_sin: -1, cutoff_month_cos: 0 },
    onnx_input: "features",
    onnx_output: "probabilities",
    gamma_gamma: { p: 2.18, q: 3.6, v: 476.5 },
  };
}
