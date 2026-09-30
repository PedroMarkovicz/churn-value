/** The committed golden vectors from ../contracts/golden (Python's answers). */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { DerivedGolden } from "@/contract/types/golden_derived_features.gen.ts";
import type { EconomicsGolden } from "@/contract/types/golden_economics.gen.ts";
import type { GammaGammaGolden } from "@/contract/types/golden_gamma_gamma.gen.ts";

const GOLDEN = fileURLToPath(new URL("../../../contracts/golden/", import.meta.url));

function read(name: string): unknown {
  return JSON.parse(readFileSync(`${GOLDEN}${name}`, "utf8"));
}

export const economicsGolden = read("economics.json") as EconomicsGolden;
export const derivedGolden = read("derived_features.json") as DerivedGolden;
export const gammaGammaGolden = read("gamma_gamma.json") as GammaGammaGolden;

/** |actual - expected| within a relative tolerance, with an absolute floor for values near 0. */
export function close(actual: number, expected: number, rel: number, abs = 1e-12): boolean {
  return Math.abs(actual - expected) <= Math.max(abs, rel * Math.abs(expected));
}
