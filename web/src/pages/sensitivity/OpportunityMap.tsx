/**
 * Where a campaign is worth running (spec §5.3): the best list's realized profit for every pair
 * of acceptance and incentive, one sequential hue; grey where no list makes money.
 */
import { ToggleGroup } from "radix-ui";
import { useState } from "react";

import { ChartFrame, DataTable, Tooltip, useWidth } from "@/charts/primitives.tsx";
import { count, money, moneyCompact, percent } from "@/domain/format.ts";
import type { OpportunityMap as MapData } from "@/domain/stress.ts";

export const REPLACEMENT_OPTIONS = [5, 10, 25] as const;
const RAMP: [number, string][] = [
  [0, "#eef2fc"],
  [2_000, "#d6e0f8"],
  [5_000, "#b5c7f2"],
  [10_000, "#8ea8ea"],
  [20_000, "#6688e0"],
  [40_000, "#4169d6"],
  [80_000, "#2f5bd3"],
  [130_000, "#23459f"],
];
const NO_PROFIT = "#e7e8ee";
const M = { top: 8, right: 8, bottom: 40, left: 52 };

function fill(value: number): string {
  if (value <= 0) return NO_PROFIT;
  let color = RAMP[0]?.[1] ?? NO_PROFIT;
  for (const [threshold, c] of RAMP) if (value >= threshold) color = c;
  return color;
}

export function OpportunityMap({
  map,
  lambdaA,
  onLambdaA,
  here,
}: {
  map: MapData | null;
  lambdaA: number;
  onLambdaA: (value: number) => void;
  here: { gamma: number; lambdaC: number } | null; // null when the scenario is off this map
}) {
  const [ref, width] = useWidth<HTMLDivElement>(420);
  const [hover, setHover] = useState<{ r: number; c: number } | null>(null);
  const height = Math.round(Math.min(width, 520) * 0.72) + M.top + M.bottom;
  const cols = map?.gammas.length ?? 21;
  const rows = map?.lambdaCs.length ?? 21;
  const cw = (width - M.left - M.right) / cols;
  const ch = (height - M.top - M.bottom) / rows;
  const cellX = (c: number) => M.left + c * cw;
  const cellY = (r: number) => height - M.bottom - (r + 1) * ch;

  const nearest = (values: number[], v: number) =>
    values.reduce(
      (best, x, i) => (Math.abs(x - v) < Math.abs((values[best] ?? 0) - v) ? i : best),
      0,
    );
  const marker =
    map && here
      ? { c: nearest(map.gammas, here.gamma), r: nearest(map.lambdaCs, here.lambdaC) }
      : null;
  const at = (r: number, c: number) => (map ? (map.realized[r * cols + c] ?? 0) : 0);

  return (
    <ChartFrame
      title="Where a campaign is worth running"
      subtitle="Realized profit of the best list for each pair of acceptance and incentive. Grey: no list makes money."
      legend={
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted" id="replacement-label">
            Replacement cost
          </span>
          <ToggleGroup.Root
            type="single"
            aria-labelledby="replacement-label"
            value={String(lambdaA)}
            onValueChange={(v) => {
              if (v) onLambdaA(Number(v));
            }}
            className="flex gap-1"
          >
            {REPLACEMENT_OPTIONS.map((v) => (
              <ToggleGroup.Item
                key={v}
                value={String(v)}
                className="rounded-md px-2 py-0.5 shadow-[inset_0_0_0_1px_var(--color-rule)] data-[state=on]:bg-ink data-[state=on]:text-panel data-[state=on]:shadow-none"
              >
                {v}×
              </ToggleGroup.Item>
            ))}
          </ToggleGroup.Root>
        </div>
      }
      table={
        <DataTable
          columns={[
            "Incentive \\ acceptance",
            ...(map?.gammas.filter((_, i) => i % 4 === 0).map((g) => percent(g)) ?? []),
          ]}
          rows={(map?.lambdaCs ?? []).flatMap((lc, r) =>
            r % 2 === 0
              ? [
                  [
                    percent(lc, 1),
                    ...(map?.gammas.flatMap((_, c) =>
                      c % 4 === 0 ? [moneyCompact(at(r, c))] : [],
                    ) ?? []),
                  ],
                ]
              : [],
          )}
        />
      }
    >
      <div ref={ref} className="relative" aria-busy={map === null}>
        <svg
          width={width}
          height={height}
          role="img"
          aria-label="Heat map of realized profit by acceptance and incentive"
          className="block"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const c = Math.floor((event.clientX - box.left - M.left) / cw);
            const r = Math.floor((height - M.bottom - (event.clientY - box.top)) / ch);
            setHover(c >= 0 && c < cols && r >= 0 && r < rows ? { r, c } : null);
          }}
          onPointerLeave={() => {
            setHover(null);
          }}
        >
          {map &&
            map.lambdaCs.map((_, r) =>
              map.gammas.map((__, c) => (
                <rect
                  key={`${r}-${c}`}
                  x={cellX(c)}
                  y={cellY(r)}
                  width={cw - 1}
                  height={ch - 1}
                  fill={fill(at(r, c))}
                />
              )),
            )}
          {[0, 0.25, 0.5, 0.75, 1].map((g) => (
            <text
              key={g}
              x={M.left + g * (width - M.left - M.right)}
              y={height - M.bottom + 15}
              textAnchor={g === 0 ? "start" : g === 1 ? "end" : "middle"}
              fontSize={10.5}
              fill="var(--color-muted)"
            >
              {percent(g)}
            </text>
          ))}
          <text
            x={(M.left + width) / 2}
            y={height - 6}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-muted)"
          >
            acceptance
          </text>
          {[0, 0.25, 0.5].map((lc) => (
            <text
              key={lc}
              x={M.left - 6}
              y={height - M.bottom - (lc / 0.5) * (height - M.top - M.bottom) + 4}
              textAnchor="end"
              fontSize={10.5}
              fill="var(--color-muted)"
            >
              {percent(lc)}
            </text>
          ))}
          <text
            x={12}
            y={(height - M.bottom) / 2}
            transform={`rotate(-90 12 ${(height - M.bottom) / 2})`}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-muted)"
          >
            incentive, share of value
          </text>
          {marker && (
            <g>
              <circle
                cx={cellX(marker.c) + cw / 2}
                cy={cellY(marker.r) + ch / 2}
                r={6}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth={2}
              />
              <text
                x={cellX(marker.c) + cw / 2 + 10}
                y={cellY(marker.r) + ch / 2 - 8}
                fontSize={11}
                fontWeight={600}
                fill="var(--color-ink)"
                stroke="var(--color-panel)"
                strokeWidth={3}
                paintOrder="stroke"
              >
                you are here
              </text>
            </g>
          )}
        </svg>
        {hover && map && (
          <Tooltip x={cellX(hover.c) + cw} y={cellY(hover.r)} width={width}>
            Acceptance {percent(map.gammas[hover.c] ?? 0)}, incentive{" "}
            {percent(map.lambdaCs[hover.r] ?? 0, 1)}
            <br />
            Best list: {count(map.k[hover.r * cols + hover.c] ?? 0)} calls,{" "}
            {money(at(hover.r, hover.c))}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
