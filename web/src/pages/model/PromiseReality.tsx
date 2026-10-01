/**
 * Promise against reality (spec §5.5): what each model's list was expected to earn (hollow) and
 * what it made on the holdout (filled, with its 95 % interval), at the default scenario.
 */
import { scaleLinear } from "@visx/scale";
import { useState } from "react";

import { modelColor } from "@/charts/palette.ts";
import { ChartFrame, DataTable, LegendItem, Tooltip, useWidth } from "@/charts/primitives.tsx";
import { monthName } from "@/domain/customerText.ts";
import { money, moneyCompact } from "@/domain/format.ts";
import { type PromiseRow, promiseTitle } from "@/domain/model.ts";

const ROW = 52;
const M = { top: 12, right: 24, bottom: 32, left: 150 };

function Dot({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden width={12} height={12} className="inline-block">
      <circle
        cx={6}
        cy={6}
        r={4.5}
        fill={filled ? "var(--color-ink)" : "var(--color-panel)"}
        stroke="var(--color-ink)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

const reading = (row: PromiseRow) =>
  row.shortfall >= 0
    ? `promised ${money(row.shortfall)} more than it made`
    : `made ${money(-row.shortfall)} more than it promised`;

export function PromiseReality({ rows, testCutoff }: { rows: PromiseRow[]; testCutoff: string }) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const drawn = rows.filter((r) => modelColor(r.position) !== null);
  const stacked = width < 480; // on a phone the name goes above the row, not beside it
  const left = stacked ? 28 : M.left; // room for the first axis label
  const row = stacked ? ROW + 16 : ROW;
  const values = drawn.flatMap((r) => [r.expected, r.low, r.high, 0]);
  const x = scaleLinear<number>({
    domain: [Math.min(0, ...values), Math.max(0, ...values)],
    range: [left, width - M.right],
    nice: true,
  });
  const height = M.top + drawn.length * row + M.bottom;
  const hovered = hover === null ? null : (drawn[hover] ?? null);
  const hidden = rows.filter((r) => !drawn.includes(r));

  return (
    <ChartFrame
      title={promiseTitle(rows)}
      subtitle={`Expected profit (hollow) against realized profit (filled) on the ${monthName(testCutoff)} holdout, with the 95% customer-bootstrap interval of what was realized.`}
      legend={
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <LegendItem swatch={<Dot filled={false} />}>expected before the outcomes</LegendItem>
          <LegendItem swatch={<Dot filled />}>realized on the holdout</LegendItem>
        </p>
      }
      table={
        <DataTable
          columns={["Model", "Expected", "Realized", "95% interval", "Difference"]}
          rows={rows.map((r) => [
            r.model.label,
            money(r.expected),
            money(r.realized),
            `${money(r.low)} to ${money(r.high)}`,
            reading(r),
          ])}
        />
      }
      note={
        hidden.length > 0
          ? `In the table only: ${hidden.map((r) => r.model.label).join(", ")}.`
          : undefined
      }
    >
      <div ref={ref} className="relative">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`Expected against realized profit for ${drawn.length} models.`}
          className="block max-w-full"
          onPointerLeave={() => {
            setHover(null);
          }}
        >
          {x.ticks(5).map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={M.top}
                y2={height - M.bottom}
                stroke={t === 0 ? "var(--color-ink)" : "var(--color-rule)"}
              />
              <text
                x={x(t)}
                y={height - 12}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {moneyCompact(t)}
              </text>
            </g>
          ))}
          {drawn.map((r, i) => {
            const color = modelColor(r.position) ?? "var(--color-muted)";
            const cy = M.top + i * row + row / 2 - (stacked ? 0 : 8);
            return (
              <g
                key={r.model.name}
                onPointerEnter={() => {
                  setHover(i);
                }}
              >
                <rect x={0} y={M.top + i * row} width={width} height={row} fill="transparent" />
                <text
                  x={stacked ? left : left - 12}
                  y={stacked ? cy - 16 : cy}
                  dy="0.32em"
                  textAnchor={stacked ? "start" : "end"}
                  fontSize={12}
                  fill="var(--color-ink)"
                >
                  {r.model.label}
                </text>
                <line
                  x1={x(r.expected)}
                  x2={x(r.realized)}
                  y1={cy}
                  y2={cy}
                  stroke="var(--color-rule)"
                  strokeWidth={2}
                />
                <line
                  x1={x(r.low)}
                  x2={x(r.high)}
                  y1={cy}
                  y2={cy}
                  stroke={color}
                  strokeWidth={1.5}
                />
                <line
                  x1={x(r.low)}
                  x2={x(r.low)}
                  y1={cy - 4}
                  y2={cy + 4}
                  stroke={color}
                  strokeWidth={1.5}
                />
                <line
                  x1={x(r.high)}
                  x2={x(r.high)}
                  y1={cy - 4}
                  y2={cy + 4}
                  stroke={color}
                  strokeWidth={1.5}
                />
                <circle
                  cx={x(r.expected)}
                  cy={cy}
                  r={6}
                  fill="var(--color-panel)"
                  stroke={color}
                  strokeWidth={2}
                />
                <circle cx={x(r.realized)} cy={cy} r={6} fill={color} />
                <text x={left} y={cy + 20} fontSize={11} fill="var(--color-muted)">
                  {reading(r)}
                </text>
              </g>
            );
          })}
        </svg>
        {hovered && hover !== null && (
          <Tooltip x={x(hovered.realized)} y={M.top + hover * row} width={width}>
            <b>{hovered.model.label}</b>
            <br />
            Expected {money(hovered.expected)}
            <br />
            Realized {money(hovered.realized)} ({money(hovered.low)} to {money(hovered.high)})
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
