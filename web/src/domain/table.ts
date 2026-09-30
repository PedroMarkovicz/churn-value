/** The holdout customers as columns (one typed array per field), built once after validation. */
import type { CustomersFile } from "@/contract/index.ts";

export interface CustomerTable {
  n: number;
  ids: Int32Array;
  churn: Float64Array; // 0 or 1, as numbers for the profit formulas
  aovGG: Float64Array;
  cadenceDays: Float64Array;
  models: string[]; // ladder order, as in the artifacts
  deployed: string;
  p: ReadonlyMap<string, Float64Array>; // calibrated churn probability per model
  features: ReadonlyMap<string, Float64Array>;
  indexById: ReadonlyMap<number, number>;
}

export function buildTable(file: CustomersFile): CustomerTable {
  const rows = file.customers;
  const n = rows.length;
  const column = (get: (i: number) => number) => Float64Array.from({ length: n }, (_, i) => get(i));
  const row = (i: number) => rows[i] as (typeof rows)[number];
  const p = new Map(
    file.models.map((model) => [model, column((i) => row(i).p[model] ?? Number.NaN)] as const),
  );
  const featureNames = n > 0 ? Object.keys(row(0).features) : [];
  const features = new Map(
    featureNames.map((name) => [name, column((i) => row(i).features[name] ?? Number.NaN)] as const),
  );
  return {
    n,
    ids: Int32Array.from(rows, (c) => c.customer_id),
    churn: column((i) => row(i).churn),
    aovGG: column((i) => row(i).aov_gg),
    cadenceDays: column((i) => row(i).cadence_days),
    models: [...file.models],
    deployed: file.deployed_model,
    p,
    features,
    indexById: new Map(rows.map((c, i) => [c.customer_id, i])),
  };
}

export function probabilities(table: CustomerTable, model: string): Float64Array {
  const p = table.p.get(model);
  if (!p) throw new Error(`no probabilities for model ${model}`);
  return p;
}

export function feature(table: CustomerTable, name: string): Float64Array {
  const values = table.features.get(name);
  if (!values) throw new Error(`no feature ${name}`);
  return values;
}
