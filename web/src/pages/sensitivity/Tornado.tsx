/** Which assumption moves the result most (spec §5.3): each across its range, list rebuilt. */
import { scaleLinear } from "@visx/scale";

import { ChartFrame, DataTable, useWidth } from "@/charts/primitives.tsx";
import { money, moneyCompact } from "@/domain/format.ts";
import { tornadoTitle } from "@/domain/headlines.ts";
import type { TornadoBar } from "@/domain/stress.ts";
import { formatParameter } from "@/scenario/copy.ts";
import { PARAMETERS } from "@/scenario/schema.ts";

const ROW = 32;
const LABEL = 150;
const LABELS = Object.fromEntries(
  Object.entries(PARAMETERS).map(([name, spec]) => [name, spec.label]),
);

export function Tornado({ bars, today }: { bars: TornadoBar[] | null; today: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const rows = bars ?? [];
  const lo = Math.min(0, today, ...rows.map((b) => b.low));
  const hi = Math.max(0, today, ...rows.map((b) => b.high));
  const x = scaleLinear({ domain: [lo, hi], range: [LABEL, width - 64], nice: true });
  const height = rows.length * ROW + 26;
  const range = (bar: TornadoBar) => {
    const spec = PARAMETERS[bar.parameter];
    return `${formatParameter(bar.parameter, spec.min)} to ${formatParameter(bar.parameter, spec.max)}`;
  };

  return (
    <ChartFrame
      title={bars ? tornadoTitle(rows, LABELS) : "How much each assumption moves the result"}
      subtitle="Realized profit when one assumption moves across its whole range and the list is rebuilt, the others held at today's values."
      table={
        <DataTable
          columns={["Assumption", "Range", "Worst", "Best"]}
          rows={rows.map((b) => [
            LABELS[b.parameter] ?? b.parameter,
            range(b),
            money(b.low),
            money(b.high),
          ])}
        />
      }
    >
      <div ref={ref} aria-busy={bars === null}>
        <svg
          width={width}
          height={Math.max(height, 60)}
          role="img"
          aria-label="Tornado chart of the assumptions"
          className="block"
        >
          <line x1={x(0)} x2={x(0)} y1={0} y2={height - 22} stroke="var(--color-rule)" />
          <line
            x1={x(today)}
            x2={x(today)}
            y1={0}
            y2={height - 22}
            stroke="var(--color-ink)"
            strokeDasharray="2 3"
          />
          <text x={x(today) + 4} y={height - 6} fontSize={10.5} fill="var(--color-muted)">
            today {moneyCompact(today)}
          </text>
          {rows.map((bar, i) => {
            const y0 = i * ROW + 6;
            return (
              <g key={bar.parameter}>
                <title>{`${LABELS[bar.parameter] ?? ""}, ${range(bar)}: ${money(bar.low)} to ${money(bar.high)}`}</title>
                <text
                  x={LABEL - 10}
                  y={y0 + 12}
                  textAnchor="end"
                  fontSize={12}
                  fill="var(--color-ink)"
                >
                  {LABELS[bar.parameter]}
                </text>
                <rect
                  x={x(Math.min(bar.low, today))}
                  y={y0}
                  width={Math.abs(x(today) - x(bar.low))}
                  height={16}
                  rx={3}
                  fill="var(--color-midpoint)"
                />
                <rect
                  x={x(today)}
                  y={y0}
                  width={Math.max(0, x(bar.high) - x(today))}
                  height={16}
                  rx={3}
                  fill="var(--color-profit)"
                />
                {bar.high - today > (hi - lo) * 0.04 && (
                  <text x={x(bar.high) + 6} y={y0 + 12} fontSize={11} fill="var(--color-ink)">
                    {moneyCompact(bar.high)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFrame>
  );
}
