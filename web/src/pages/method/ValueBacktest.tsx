/**
 * The value estimate is conservative (spec §5.6): for customers who stayed, the revenue the value
 * formula predicted for the 90-day window divided by what they spent, by purchase days. The line
 * at 1× is a perfect estimate; bars end at each bucket's ratio.
 */
import { scaleLinear } from "@visx/scale";

import { ChartFrame, DataTable, useWidth } from "@/charts/primitives.tsx";
import { count, money } from "@/domain/format.ts";
import { overallRatio, type ValueBar, valueNote, valueTitle } from "@/domain/method.ts";

const ROW = 34;
const M = { top: 8, right: 56, bottom: 32, left: 176 };
const times = (ratio: number | null) => (ratio === null ? "–" : `${ratio.toFixed(2)}×`);

export function ValueBacktest({ bars }: { bars: ValueBar[] }) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const narrow = width < 480;
  const left = narrow ? 72 : M.left;
  const shown = bars.filter((b) => b.ratio !== null);
  const top = Math.max(1.5, ...shown.map((b) => b.ratio ?? 0));
  const x = scaleLinear<number>({ domain: [0, top], range: [left, width - M.right], nice: true });
  const height = M.top + shown.length * ROW + M.bottom;
  const all = overallRatio(bars);

  return (
    <ChartFrame
      title={valueTitle(bars)}
      subtitle="Customers who stayed: the revenue the value formula predicted for the 90-day window, divided by what they actually spent. Below 1× the estimate is conservative."
      table={
        <DataTable
          columns={["Purchase days", "Customers", "Predicted", "Actual", "Ratio"]}
          rows={[
            ...bars.map((b) => [
              b.label,
              count(b.n),
              money(b.predicted),
              money(b.actual),
              times(b.ratio),
            ]),
            [
              "All",
              count(bars.reduce((s, b) => s + b.n, 0)),
              money(bars.reduce((s, b) => s + b.predicted, 0)),
              money(bars.reduce((s, b) => s + b.actual, 0)),
              times(all),
            ],
          ]}
        />
      }
      note={valueNote(bars)}
    >
      <div ref={ref}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Predicted over actual revenue by purchase days; ${all === null ? "no overall ratio" : `overall ${times(all)}`}.`}
          className="block max-w-full"
        >
          {x.ticks(4).map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={M.top}
                y2={height - M.bottom}
                stroke={t === 1 ? "var(--color-ink)" : "var(--color-rule)"}
              />
              <text
                x={x(t)}
                y={height - 12}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {t}×
              </text>
            </g>
          ))}
          {shown.map((b, i) => {
            const cy = M.top + i * ROW + ROW / 2;
            const ratio = b.ratio ?? 0;
            return (
              <g key={b.bucket}>
                <text
                  x={left - 10}
                  y={cy}
                  dy="0.32em"
                  textAnchor="end"
                  fontSize={12}
                  fill="var(--color-ink)"
                >
                  {narrow ? `${b.bucket} days` : b.label}
                </text>
                <rect
                  x={left}
                  y={cy - 8}
                  width={Math.max(0, x(ratio) - left)}
                  height={16}
                  rx={3}
                  fill="var(--color-ink)"
                  opacity={ratio > 1 ? 0.85 : 0.35}
                />
                <text x={x(ratio) + 6} y={cy} dy="0.32em" fontSize={11} fill="var(--color-ink)">
                  {times(b.ratio)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>
    </ChartFrame>
  );
}
