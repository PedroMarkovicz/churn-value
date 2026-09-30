/**
 * The e2e tests check the site against numbers computed here, independently of the app's code:
 * straight from the installed artifacts and the Python evaluation.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as ort from "onnxruntime-node";

const DATA = fileURLToPath(new URL("../../public/data/", import.meta.url));

interface Customer {
  customer_id: number;
  features: Record<string, number>;
  churn: number;
  p: Record<string, number>;
  aov_gg: number;
  cadence_days: number;
}
interface Policy {
  policy: string;
  n_contacted: number;
  realized_profit: number;
  expected_profit: number | null;
}

export const customers = JSON.parse(readFileSync(`${DATA}customers.json`, "utf8")) as {
  deployed_model: string;
  customers: Customer[];
};
export const evaluation = JSON.parse(readFileSync(`${DATA}evaluation.json`, "utf8")) as {
  policies: Policy[];
};

export function deployedPolicy(): Policy {
  const row = evaluation.policies.find((p) => p.policy === customers.deployed_model);
  if (!row) throw new Error("the evaluation has no row for the deployed model");
  return row;
}

/** £23,139 with the true minus sign, as the site writes money. */
export function gbp(value: number): string {
  const text = `£${Math.round(Math.abs(value)).toLocaleString("en-GB")}`;
  return value < 0 ? `\u2212${text}` : text;
}

/** Break-even acceptance of the default-economics list built for `gamma` (design §4). */
export function breakEven(gamma: number): number {
  const [m, lc, la, c, t] = [0.35, 0.1, 10, 1, 365];
  let gain = 0;
  let loss = 0;
  for (const row of customers.customers) {
    const v = m * row.aov_gg * (t / row.cadence_days);
    const crc = lc * v;
    const b = Math.min(v, la * crc);
    const p = row.p[customers.deployed_model] ?? 0;
    if (p * gamma * (b - crc) - (1 - p) * crc - c <= 0) continue;
    loss += c;
    if (row.churn === 1) gain += b - crc;
    else loss += crc;
  }
  return loss / gain;
}

interface FeatureSpecFile {
  order: string[];
  onnx_input: string;
  onnx_output: string;
  horizon_days: number;
  cadence_floor_days: number;
  spend_trend_eps: number;
  context: Record<string, number>;
}
type Calibrator =
  | { method: "platt"; slope: number; intercept: number }
  | { method: "isotonic"; x: number[]; y: number[] };

const featureSpec = JSON.parse(readFileSync(`${DATA}feature_spec.json`, "utf8")) as FeatureSpecFile;
const { calibrator } = JSON.parse(readFileSync(`${DATA}calibrator.json`, "utf8")) as {
  calibrator: Calibrator;
};

/**
 * The served model's churn probability for customer `id` with `edits`, computed in Node with the
 * feature formulas written out again (design §3) and onnxruntime-node: the browser must agree.
 */
export async function nodeChurnProbability(
  id: number,
  edits: Record<string, number>,
): Promise<number> {
  const customer = customers.customers.find((c) => c.customer_id === id);
  if (!customer) throw new Error(`no customer ${id}`);
  const f: Record<string, number> = { ...customer.features, ...edits };
  const get = (name: string) => f[name] ?? Number.NaN;
  f.avg_order_value = get("total_spend") / get("n_purchase_days");
  const cadence = Math.max(
    (get("tenure_days") - get("recency_days")) / Math.max(get("n_purchase_days") - 1, 1),
    featureSpec.cadence_floor_days,
  );
  Object.assign(
    f,
    {
      cadence_days: cadence,
      overdue_ratio: get("recency_days") / cadence,
      expected_purchases_h: featureSpec.horizon_days / cadence,
      spend_trend: get("spend_90d") / (get("spend_prev_90d") + featureSpec.spend_trend_eps),
    },
    featureSpec.context,
  );
  const x = Float32Array.from(featureSpec.order, (name) => get(name));
  const session = await ort.InferenceSession.create(readFileSync(`${DATA}model.onnx`));
  const result = await session.run({
    [featureSpec.onnx_input]: new ort.Tensor("float32", x, [1, x.length]),
  });
  const data = result[featureSpec.onnx_output]?.data;
  if (!(data instanceof Float32Array)) throw new Error("model.onnx gave no probabilities");
  const score = data[1] ?? Number.NaN;
  if (calibrator.method === "platt") {
    return 1 / (1 + Math.exp(-(calibrator.slope * score + calibrator.intercept)));
  }
  const at = (values: number[], i: number) => values[i] ?? Number.NaN;
  const hi = calibrator.x.findIndex((t) => t > score);
  if (hi === 0) return at(calibrator.y, 0);
  if (hi === -1) return at(calibrator.y, calibrator.y.length - 1);
  const lo = hi - 1;
  const t = (score - at(calibrator.x, lo)) / (at(calibrator.x, hi) - at(calibrator.x, lo));
  return at(calibrator.y, lo) + t * (at(calibrator.y, hi) - at(calibrator.y, lo));
}
