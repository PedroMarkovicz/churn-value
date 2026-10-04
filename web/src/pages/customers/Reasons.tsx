/**
 * Why the model flags them (spec §5.4, item 6): the strongest SHAP contributions as plain facts,
 * each with a bar to the right (raises the risk) or the left (lowers it) of a centre line. Values
 * are the model's own explanation, measured against a typical customer in the cutoff month; no
 * SHAP is recomputed in the browser.
 */
import { BoxSwatch, ChartFrame, DataTable, LegendItem } from "@/charts/primitives.tsx";
import type { Contribution } from "@/contract/index.ts";
import { reasonsTitle } from "@/domain/customerText.ts";
import { effectText, reasonText, signedShap } from "@/domain/reasons.ts";

interface Props {
  contributions: readonly Contribution[];
  horizonDays: number;
  month: string;
}

export function Reasons({ contributions, horizonDays, month }: Props) {
  const largest = Math.max(1e-9, ...contributions.map((c) => Math.abs(c.shap)));
  return (
    <ChartFrame
      level={3}
      title={reasonsTitle(contributions, horizonDays)}
      subtitle={`Why the model flags them: the strongest reasons from its own explanation (SHAP), measured against a typical customer in ${month}.`}
      legend={
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <LegendItem swatch={<BoxSwatch color="var(--color-lower)" />}>lowers the risk</LegendItem>
          <LegendItem swatch={<BoxSwatch color="var(--color-raise)" />}>raises the risk</LegendItem>
        </p>
      }
      table={
        <DataTable
          columns={["Reason", "Effect", "Size (SHAP, log-odds)"]}
          rows={contributions.map((c) => [
            reasonText(c, horizonDays),
            effectText(c.shap),
            signedShap(c.shap),
          ])}
        />
      }
    >
      <ol className="grid gap-3">
        {contributions.map((c) => {
          const size = (Math.abs(c.shap) / largest) * 50; // percent of the width, per side
          const raises = c.shap > 0;
          return (
            <li key={c.feature} className="grid gap-1">
              <span className="text-sm">{reasonText(c, horizonDays)}</span>
              <span aria-hidden className="relative block h-3">
                <span className="absolute inset-y-0 left-1/2 w-px bg-ink" />
                <span
                  className="absolute inset-y-0 rounded-[3px]"
                  style={{
                    background: raises ? "var(--color-raise)" : "var(--color-lower)",
                    width: `${size}%`,
                    left: raises ? "50%" : `${50 - size}%`,
                  }}
                />
              </span>
              <span className="sr-only">{effectText(c.shap)}</span>
            </li>
          );
        })}
      </ol>
    </ChartFrame>
  );
}
