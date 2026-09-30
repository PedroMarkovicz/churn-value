/**
 * Run a computation in the compute worker, keyed by its inputs: the latest request wins, stale
 * results are dropped, the previous result stays on screen while the next one runs, and if the
 * worker is unavailable or fails the same pure function runs on the main thread.
 */
import * as Comlink from "comlink";
import { useEffect, useEffectEvent, useState } from "react";

import type { ComputeApi } from "./compute.worker.ts";

const DEBOUNCE_MS = 120;
/** A job that takes longer than this is treated as a dead worker (the slowest takes ~0.3 s). */
export const WORKER_TIMEOUT_MS = 5000;
let remote: Comlink.Remote<ComputeApi> | null | undefined;
let broken = false; // set once the worker failed to start, errored or hung

function worker(): Comlink.Remote<ComputeApi> | null {
  if (remote === undefined) {
    remote = null;
    if (typeof Worker !== "undefined") {
      try {
        const instance = new Worker(new URL("./compute.worker.ts", import.meta.url), {
          type: "module",
        });
        // A script that fails to load (404, CSP) never answers Comlink: stop using it.
        instance.addEventListener("error", () => {
          broken = true;
        });
        remote = Comlink.wrap<ComputeApi>(instance);
      } catch {
        remote = null;
      }
    }
  }
  return broken ? null : remote;
}

/**
 * The worker's answer, or the main thread's when there is no worker, it rejects, or it does not
 * answer within `timeoutMs` (after which the worker is not used again).
 */
export async function runWithFallback<T>(
  api: Comlink.Remote<ComputeApi> | null,
  viaWorker: (api: Comlink.Remote<ComputeApi>) => Promise<T>,
  onMainThread: () => T,
  timeoutMs = WORKER_TIMEOUT_MS,
): Promise<T> {
  if (!api || broken) return onMainThread();
  let timer: number | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error("the compute worker did not answer"));
    }, timeoutMs);
  });
  try {
    return await Promise.race([viaWorker(api), timeout]);
  } catch {
    broken = true;
    return onMainThread();
  } finally {
    window.clearTimeout(timer);
  }
}

export interface Computed<T> {
  value: T | null; // the latest finished result (maybe for an older key)
  pending: boolean; // a result for the current key is on its way
}

export function useCompute<T>(
  key: string,
  viaWorker: (api: Comlink.Remote<ComputeApi>) => Promise<T>,
  onMainThread: () => T,
): Computed<T> {
  const [done, setDone] = useState<{ key: string; value: T } | null>(null);
  // Reads the latest closures without making them effect dependencies: only `key` reruns.
  const start = useEffectEvent((): Promise<T> =>
    runWithFallback(worker(), viaWorker, onMainThread),
  );

  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void start().then((value) => {
        if (!cancelled) setDone({ key, value });
      });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [key]);

  return { value: done?.value ?? null, pending: done?.key !== key };
}
