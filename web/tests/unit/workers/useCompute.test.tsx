import { renderHook, waitFor } from "@testing-library/react";

import { runWithFallback, useCompute } from "@/workers/useCompute.ts";

// jsdom has no Worker, so these run the main-thread path: the one used when a worker fails.

test("the result for the latest key wins and the previous one stays until it arrives", async () => {
  const worker = () => Promise.reject(new Error("no worker in this test"));
  const { result, rerender } = renderHook(({ k }) => useCompute(k, worker, () => `value ${k}`), {
    initialProps: { k: "a" },
  });
  expect(result.current).toEqual({ value: null, pending: true });
  await waitFor(() => {
    expect(result.current).toEqual({ value: "value a", pending: false });
  });
  rerender({ k: "b" });
  expect(result.current).toEqual({ value: "value a", pending: true }); // stale, not blank
  rerender({ k: "c" });
  await waitFor(() => {
    expect(result.current).toEqual({ value: "value c", pending: false });
  });
});

test("keys that change faster than the debounce compute only the last one", async () => {
  const calls: string[] = [];
  const { result, rerender } = renderHook(
    ({ k }) =>
      useCompute(
        k,
        () => Promise.reject(new Error("no worker")),
        () => {
          calls.push(k);
          return k;
        },
      ),
    { initialProps: { k: "1" } },
  );
  rerender({ k: "2" });
  rerender({ k: "3" });
  await waitFor(() => {
    expect(result.current.value).toBe("3");
  });
  expect(calls).toEqual(["3"]);
});

test("a worker that never answers falls back to the main thread after a timeout", async () => {
  const api = {} as Parameters<typeof runWithFallback>[0];
  const never = () => new Promise<string>(() => {});
  const started = Date.now();
  await expect(runWithFallback(api, never, () => "main thread", 50)).resolves.toBe("main thread");
  expect(Date.now() - started).toBeGreaterThanOrEqual(45);
  // once the worker has hung, later calls go straight to the main thread
  const later = await runWithFallback(api, never, () => "again", 10_000);
  expect(later).toBe("again");
});
