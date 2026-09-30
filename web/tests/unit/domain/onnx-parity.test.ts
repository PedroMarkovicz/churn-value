// @vitest-environment node
/**
 * The served model.onnx, run by onnxruntime-node and calibrated in TypeScript, must reproduce
 * Python: the golden cases, and every holdout customer's probability rebuilt by the what-if.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import * as ort from "onnxruntime-node";

import { validateArtifact } from "@/contract/load.ts";
import type { ModelGolden } from "@/contract/types/golden_model.gen.ts";
import { calibrate } from "@/domain/calibrator.ts";
import { baseValues, modelFeatures } from "@/domain/whatif.ts";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const installed = existsSync(`${DATA}model.onnx`);
const read = (name: string): unknown => JSON.parse(readFileSync(`${DATA}${name}`, "utf8"));

/** Raw churn probabilities (ONNX output column 1) for `rows`, in float32 as in the browser. */
async function scores(rows: ArrayLike<number>[], input: string, output: string) {
  const session = await ort.InferenceSession.create(readFileSync(`${DATA}model.onnx`));
  const width = rows[0]?.length ?? 0;
  const x = new Float32Array(rows.length * width);
  rows.forEach((row, i) => {
    x.set(Array.from(row), i * width);
  });
  const result = await session.run({ [input]: new ort.Tensor("float32", x, [rows.length, width]) });
  const data = result[output]?.data;
  if (!(data instanceof Float32Array)) throw new Error(`no float output ${output}`);
  return Array.from({ length: rows.length }, (_, i) => data[i * 2 + 1] as number);
}

test.skipIf(!installed)(
  "ONNX plus the TypeScript calibrator reproduce the golden cases",
  async () => {
    const spec = validateArtifact("feature_spec", read("feature_spec.json"));
    const calibrator = validateArtifact("calibrator", read("calibrator.json"));
    const golden = read("golden/model.json") as ModelGolden;
    expect(golden.order).toEqual(spec.order);
    const s = await scores(
      golden.cases.map((c) => c.features),
      spec.onnx_input,
      spec.onnx_output,
    );
    golden.cases.forEach((c, i) => {
      const score = s[i] ?? Number.NaN;
      expect(Math.abs(score - c.score)).toBeLessThanOrEqual(golden.tolerance);
      expect(Math.abs(calibrate(score, calibrator) - c.p)).toBeLessThanOrEqual(golden.tolerance);
    });
  },
);

test.skipIf(!installed)(
  "the what-if's rebuilt input gives back every customer's served probability",
  async () => {
    const spec = validateArtifact("feature_spec", read("feature_spec.json"));
    const calibrator = validateArtifact("calibrator", read("calibrator.json"));
    const customers = validateArtifact("customers", read("customers.json"));
    const rows = customers.customers.map((c) => modelFeatures(baseValues(c.features, spec), spec));
    const s = await scores(rows, spec.onnx_input, spec.onnx_output);
    customers.customers.forEach((c, i) => {
      const served = c.p[customers.deployed_model] ?? Number.NaN;
      const p = calibrate(s[i] ?? Number.NaN, calibrator);
      expect(Math.abs(p - served), String(c.customer_id)).toBeLessThanOrEqual(1e-5);
    });
  },
);
