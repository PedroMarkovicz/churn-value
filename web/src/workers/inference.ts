/**
 * The page's side of the inference worker (spec §6.4). The worker, and the wasm it fetches, starts
 * on the first what-if. A failure is final for the visit: the what-if then says it is unavailable
 * instead of retrying. There is no main-thread fallback; the drawer works without the model.
 */
import * as Comlink from "comlink";
import { useEffect, useEffectEvent, useState } from "react";

import type { InferApi } from "./infer.worker.ts";

/** Calibrated churn probability for one row of model features (in feature_spec.order). */
export type Scorer = (features: Float64Array) => Promise<number>;

const DEBOUNCE_MS = 150;
/** Room to fetch the wasm on a slow connection; a dead worker is caught by its error event. */
export const SCORE_TIMEOUT_MS = 60_000;

interface Started {
  api: Comlink.Remote<InferApi>;
  crashed: Promise<never>; // rejects when the worker script fails to load or throws
}
let started: Started | null = null;
let failure: Error | null = null;

function start(): Started {
  const worker = new Worker(new URL("./infer.worker.ts", import.meta.url), { type: "module" });
  const crashed = new Promise<never>((_, reject) => {
    worker.addEventListener("error", () => {
      reject(new Error("the inference worker failed to load"));
    });
  });
  crashed.catch(() => undefined); // raced below; never an unhandled rejection
  return { api: Comlink.wrap<InferApi>(worker), crashed };
}

/** The worker-backed scorer, or null where there are no workers. */
export function workerScorer(): Scorer | null {
  if (typeof Worker === "undefined") return null;
  return async (features) => {
    if (failure !== null) throw failure;
    try {
      started ??= start();
      return await Promise.race([started.api.churnProbability(features), started.crashed]);
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error));
      throw failure;
    }
  };
}

export type Scored =
  | { status: "idle" } // nothing to score
  | { status: "running" }
  | { status: "ready"; p: number }
  | { status: "failed" }; // no scorer, or it failed or timed out: final

/**
 * The scorer's answer for `features` (null: nothing to score). Debounced; the latest request
 * wins; a run that takes longer than `timeoutMs` counts as a failure.
 */
export function useChurnProbability(
  scorer: Scorer | null,
  features: Float64Array | null,
  timeoutMs = SCORE_TIMEOUT_MS,
): Scored {
  const key = features === null ? null : features.join(",");
  const [done, setDone] = useState<{ key: string; p: number } | null>(null);
  const [failed, setFailed] = useState(false);

  // Reads the latest scorer and features without making them effect dependencies.
  const run = useEffectEvent(async (): Promise<number> => {
    if (!scorer || !features) throw new Error("nothing to score");
    let timer: number | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = window.setTimeout(() => {
        reject(new Error("the model did not answer"));
      }, timeoutMs);
    });
    try {
      return await Promise.race([scorer(features), timeout]);
    } finally {
      window.clearTimeout(timer);
    }
  });

  useEffect(() => {
    if (key === null) return;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      run().then(
        (p) => {
          if (!cancelled) setDone({ key, p });
        },
        () => {
          if (!cancelled) setFailed(true);
        },
      );
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  if (key === null) return { status: "idle" };
  if (!scorer || failed) return { status: "failed" };
  return done?.key === key ? { status: "ready", p: done.p } : { status: "running" };
}
