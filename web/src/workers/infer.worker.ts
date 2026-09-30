/// <reference lib="webworker" />
/**
 * The what-if's model (spec §6.4). onnxruntime-web runs the served model.onnx once its SHA-256
 * matches the manifest, then the served calibrator turns the raw score into p. WebAssembly on one
 * thread: threads need cross-origin isolation, which a static host does not give. The wasm
 * (about 3.7 MB gzip) is fetched on the first what-if and cached by the browser.
 */
import * as Comlink from "comlink";
import * as ort from "onnxruntime-web/wasm";
import wasmUrl from "onnxruntime-web/ort-wasm-simd-threaded.wasm?url";

import type { CalibratorFile } from "@/contract/index.ts";
import { ArtifactError, DATA_BASE, loadArtifact } from "@/contract/load.ts";
import { calibrate } from "@/domain/calibrator.ts";

import { sha256Hex } from "./integrity.ts";

ort.env.wasm.wasmPaths = { wasm: wasmUrl };
ort.env.wasm.numThreads = 1;

interface Model {
  session: ort.InferenceSession;
  input: string;
  output: string;
  width: number;
  calibrator: CalibratorFile;
}

async function load(): Promise<Model> {
  const manifest = await loadArtifact("manifest");
  const [spec, calibrator] = await Promise.all([
    loadArtifact("feature_spec"),
    loadArtifact("calibrator"),
  ]);
  if (calibrator.model !== manifest.deployed_model) {
    throw new ArtifactError(
      "calibrator.json",
      `calibrates ${calibrator.model}, but the served model is ${manifest.deployed_model}`,
    );
  }
  const response = await fetch(`${DATA_BASE}model.onnx`);
  if (!response.ok) throw new ArtifactError("model.onnx", `HTTP ${response.status}`);
  const bytes = await response.arrayBuffer();
  if ((await sha256Hex(bytes)) !== manifest.files["model.onnx"]) {
    throw new ArtifactError("model.onnx", "does not match its SHA-256 in the manifest");
  }
  const session = await ort.InferenceSession.create(new Uint8Array(bytes), {
    executionProviders: ["wasm"],
  });
  return {
    session,
    input: spec.onnx_input,
    output: spec.onnx_output,
    width: spec.order.length,
    calibrator,
  };
}

let model: Promise<Model> | null = null; // a failed load stays failed: the page shows it once

const api = {
  /** Calibrated churn probability for one row of model features, in feature_spec.order. */
  async churnProbability(features: Float64Array): Promise<number> {
    model ??= load();
    const m = await model;
    if (features.length !== m.width) {
      throw new Error(`the model takes ${m.width} features, got ${features.length}`);
    }
    const result = await m.session.run(
      { [m.input]: new ort.Tensor("float32", Float32Array.from(features), [1, m.width]) },
      [m.output],
    );
    const data = result[m.output]?.data;
    if (!(data instanceof Float32Array) || data.length < 2) {
      throw new Error(`model.onnx gave no ${m.output}`);
    }
    return calibrate(data[1] as number, m.calibrator); // column 1: the churn class
  },
};

export type InferApi = typeof api;
Comlink.expose(api);
