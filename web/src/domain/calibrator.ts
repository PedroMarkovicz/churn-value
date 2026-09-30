/**
 * The served calibrator (ml/src/churnvalue/calibration.py), applied to the model's raw churn
 * probability: Platt scaling, or isotonic regression evaluated like np.interp (linear between
 * thresholds, clipped outside them).
 */
import type { CalibratorFile } from "@/contract/index.ts";

export function calibrate(score: number, file: CalibratorFile): number {
  const c = file.calibrator;
  if (c.method === "platt") return 1 / (1 + Math.exp(-(c.slope * score + c.intercept)));
  return interpolate(score, c.x, c.y);
}

function interpolate(x: number, xs: readonly number[], ys: readonly number[]): number {
  const at = (values: readonly number[], i: number) => values[i] as number;
  const last = xs.length - 1;
  if (x <= at(xs, 0)) return at(ys, 0);
  if (x >= at(xs, last)) return at(ys, last);
  let lo = 0; // invariant: xs[lo] <= x < xs[hi]
  let hi = last;
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1;
    if (at(xs, mid) <= x) lo = mid;
    else hi = mid;
  }
  const slope = (at(ys, hi) - at(ys, lo)) / (at(xs, hi) - at(xs, lo));
  return slope * (x - at(xs, lo)) + at(ys, lo);
}
