/**
 * Run a computation in the compute worker, keyed by its inputs: the latest request wins, stale
 * results are dropped, the previous result stays on screen while the next one runs, and if the
 * worker is unavailable or fails the same pure function runs on the main thread.
 */
import * as Comlink from "comlink";
import { useEffect, useEffectEvent, useState } from "react";

import type { ComputeApi } from "./compute.worker.ts";

const DEBOUNCE_MS = 120;
let remote: Comlink.Remote<ComputeApi> | null | undefined;

function worker(): Comlink.Remote<ComputeApi> | null {
  if (remote === undefined) {
    remote =
      typeof Worker === "undefined"
        ? null
        : Comlink.wrap<ComputeApi>(
            new Worker(new URL("./compute.worker.ts", import.meta.url), { type: "module" }),
          );
  }
  return remote;
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
  const start = useEffectEvent((): Promise<T> => {
    const api = worker();
    if (!api) return Promise.resolve().then(onMainThread);
    return viaWorker(api).catch(() => onMainThread());
  });

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
