import type { GammaGammaSpec } from "@/contract/index.ts";

/**
 * Gamma-Gamma posterior mean spend per purchase day, p(v + x m) / (p x + q - 1), as in
 * gamma_gamma_expected_aov (ml/src/churnvalue/btyd.py): short histories shrink towards the mean.
 */
export function expectedAov(
  params: GammaGammaSpec,
  nPurchaseDays: number,
  avgOrderValue: number,
): number {
  return (
    (params.p * (params.v + nPurchaseDays * avgOrderValue)) /
    (params.p * nPurchaseDays + params.q - 1.0)
  );
}
