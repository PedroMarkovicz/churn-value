/**
 * They rank alike (spec §5.5): each model's ranking metric on the holdout with its 95 % customer-
 * bootstrap interval, switchable between ROC-AUC, PR-AUC, the Brier score and lift at 10 %.
 */
import { scaleLinear } from "@visx/scale";
import { ToggleGroup } from "radix-ui";
import { useState } from "react";

import { modelColor } from "@/charts/palette.ts";
import { ChartFrame, DataTable, Tooltip, useWidth } from "@/charts/primitives.tsx";
import type { EvaluationFile, ModelInfo } from "@/contract/index.ts";
import { monthName } from "@/domain/customerText.ts";
import { type MetricKey, METRICS, metricRows, metricTitle } from "@/domain/model.ts";

const ROW = 40;
const M = { top: 8, right: 64, bottom: 32, left: 150 };
const CHOICE =
  "rounded-md px-2.5 py-1 text-sm shadow-[inset_0_0_0_1px_var(--color-rule)] data-[state=on]:bg-ink data-[state=on]:text-panel data-[state=on]:shadow-none";

interface Props {
  evaluation: EvaluationFile;
  models: ModelInfo[];
  testCutoff: string;
}

export function RankAlike({ evaluation, models, testCutoff }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [key, setKey] = useState<MetricKey>("roc_auc");
  const [hover, setHover] = useState<number | null>(null);
  const metric = METRICS[key];
  const rows = metricRows(evaluation, models, key);
  const drawn = rows.filter((r) => modelColor(r.position) !== null);
  const stacked = width < 480; // on a phone the name goes above the row, not beside it
  const left = stacked ? 28 : M.left; // room for the first axis label
  const row = stacked ? ROW + 14 : ROW;
  const lo = Math.min(...drawn.map((r) => r.low));
  const hi = Math.max(...drawn.map((r) => r.high));
  const pad = (hi - lo) * 0.1 || 0.01;
  const x = scaleLinear<number>({
    domain: drawn.length > 0 ? [lo - pad, hi + pad] : [0, 1],
    range: [left, width - M.right],
    nice: true,
  });
  const height = M.top + drawn.length * row + M.bottom;
  const fixed = (v: number) => v.toFixed(metric.digits);
  const hovered = hover === null ? null : (drawn[hover] ?? null);

  return (
    <ChartFrame
      title={metricTitle(rows, key)}
      subtitle={`${metric.label} on the ${monthName(testCutoff)} holdout, with its 95% customer-bootstrap interval. ${metric.higherIsBetter ? "Higher is better." : "Lower is better."}`}
      legend={
        <ToggleGroup.Root
          type="single"
          aria-label="Metric"
          value={key}
          onValueChange={(value) => {
            if (value) setKey(value as MetricKey);
          }}
          className="flex flex-wrap gap-1.5"
        >
          {(Object.keys(METRICS) as MetricKey[]).map((k) => (
            <ToggleGroup.Item key={k} value={k} className={CHOICE}>
              {METRICS[k].label}
            </ToggleGroup.Item>
          ))}
        </ToggleGroup.Root>
      }
      table={
        <DataTable
          columns={["Model", metric.label, "95% interval"]}
          rows={rows.map((r) => [
            r.model.label,
            fixed(r.value),
            `${fixed(r.low)} to ${fixed(r.high)}`,
          ])}
        />
      }
    >
      <div ref={ref} className="relative">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`${metric.label} with intervals for ${drawn.length} models.`}
          className="block max-w-full"
          onPointerLeave={() => {
            setHover(null);
          }}
        >
          {x.ticks(4).map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={M.top}
                y2={height - M.bottom}
                stroke="var(--color-rule)"
              />
              <text
                x={x(t)}
                y={height - 12}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {fixed(t)}
              </text>
            </g>
          ))}
          {drawn.map((r, i) => {
            const color = modelColor(r.position) ?? "var(--color-muted)";
            const cy = M.top + i * row + row / 2 + (stacked ? 6 : 0);
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
                  y={stacked ? cy - 14 : cy}
                  dy="0.32em"
                  textAnchor={stacked ? "start" : "end"}
                  fontSize={12}
                  fill="var(--color-ink)"
                >
                  {r.model.label}
                </text>
                <line x1={x(r.low)} x2={x(r.high)} y1={cy} y2={cy} stroke={color} strokeWidth={2} />
                <line
                  x1={x(r.low)}
                  x2={x(r.low)}
                  y1={cy - 5}
                  y2={cy + 5}
                  stroke={color}
                  strokeWidth={2}
                />
                <line
                  x1={x(r.high)}
                  x2={x(r.high)}
                  y1={cy - 5}
                  y2={cy + 5}
                  stroke={color}
                  strokeWidth={2}
                />
                <circle cx={x(r.value)} cy={cy} r={5} fill={color} />
                <text x={x(r.high) + 8} y={cy} dy="0.32em" fontSize={11} fill="var(--color-ink)">
                  {fixed(r.value)}
                </text>
              </g>
            );
          })}
        </svg>
        {hovered && hover !== null && (
          <Tooltip x={x(hovered.value)} y={M.top + hover * row} width={width}>
            <b>{hovered.model.label}</b>
            <br />
            {metric.label} {fixed(hovered.value)} ({fixed(hovered.low)} to {fixed(hovered.high)})
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
