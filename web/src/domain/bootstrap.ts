/**
 * Customer bootstrap for a policy's realized profit. The holdout has one row per customer, so
 * resampling rows resamples customers. Percentiles use numpy's default linear interpolation.
 */
import { mulberry32 } from "./random.ts";

export interface Interval {
  low: number;
  high: number;
}

/** numpy.percentile(values, q) with the default "linear" method; `sorted` must be ascending. */
export function percentile(sorted: Float64Array, q: number): number {
  if (sorted.length === 0) return Number.NaN;
  const position = (q / 100) * (sorted.length - 1);
  const lower = Math.floor(position);
  const upper = Math.min(lower + 1, sorted.length - 1);
  const weight = position - lower;
  const a = sorted[lower] as number;
  return a + weight * ((sorted[upper] as number) - a);
}

/** Percentile intervals of sum(contribution[i] for called i), one per mask (95 % by default). */
export function bootstrapIntervals(
  contributions: Float64Array,
  masks: Uint8Array[],
  nBoot = 1000,
  seed = 42,
  alpha = 0.05,
): Interval[] {
  const n = contributions.length;
  const random = mulberry32(seed);
  const stats = masks.map(() => new Float64Array(nBoot));
  const draw = new Int32Array(n);
  for (let b = 0; b < nBoot; b++) {
    for (let j = 0; j < n; j++) draw[j] = Math.floor(random() * n);
    masks.forEach((mask, m) => {
      let sum = 0;
      for (let j = 0; j < n; j++) {
        const i = draw[j] as number;
        if (mask[i] === 1) sum += contributions[i] as number;
      }
      (stats[m] as Float64Array)[b] = sum;
    });
  }
  return stats.map((values) => {
    const sorted = values.slice().sort();
    return {
      low: percentile(sorted, (alpha / 2) * 100),
      high: percentile(sorted, (1 - alpha / 2) * 100),
    };
  });
}
