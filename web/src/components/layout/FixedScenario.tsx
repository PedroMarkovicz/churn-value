/** Model and Method show results at the default scenario and say so (spec §3.4). */
import type { EconomicParams } from "@/contract/index.ts";
import { chipText } from "@/scenario/copy.ts";
import { PARAMETER_ORDER } from "@/scenario/schema.ts";

export function FixedScenario({ economics }: { economics: EconomicParams }) {
  const chips = PARAMETER_ORDER.map((name) => chipText(name, economics[name])).join(", ");
  return (
    <p className="-mt-3 mb-6 max-w-[70ch] text-sm text-muted">
      Fixed results at the default scenario: {chips}. The assumptions you set elsewhere do not
      change this page.
    </p>
  );
}
