/**
 * Realized profit of each policy under the current scenario (spec §5.2): bars by polarity, a
 * bootstrap interval per list, perfect foresight as the dashed ceiling.
 */
import { scaleLinear } from "@visx/scale";
import { useState } from "react";

import { ChartFrame, DataTable, Tooltip, useWidth } from "@/charts/primitives.tsx";
import type { Interval } from "@/domain/bootstrap.ts";
import { count, money, moneyCompact, percent } from "@/domain/format.ts";
import type { PolicyComparison } from "@/domain/policies.ts";

const ROW = 34;
const LABEL = 170;

export function PolicyBars({
  comparison,
  intervals,
  pending,
}: {
  comparison: PolicyComparison;
  intervals: Record<string, Interval> | null;
  pending: boolean;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null);
  const { rows } = comparison;
  const values = rows.flatMap((row) => {
    const ci = intervals?.[row.id];
    return ci ? [row.realized, ci.low, ci.high] : [row.realized];
  });
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const x = scaleLinear({ domain: [lo, hi], range: [LABEL, width - 96], nice: true });
  const height = rows.length * ROW + 24;

  const share = comparison.shareOfOracle;
  const title =
    share !== null
      ? `The model keeps ${percent(Math.max(0, share))} of what perfect foresight would earn`
      : "What each policy would have earned";

  return (
    <ChartFrame
      title={title}
      subtitle="Realized profit of each policy on the holdout under these assumptions, with a 95% customer-bootstrap interval recomputed for this scenario."
      table={
        <DataTable
          columns={["Policy", "Customers called", "Realized", "95% interval"]}
          rows={rows.map((row) => {
            const ci = intervals?.[row.id];
            return [
              row.label,
              count(row.k),
              money(row.realized),
              ci
                ? `${money(ci.low)} to ${money(ci.high)}`
                : row.kind === "random"
                  ? "expected value"
                  : "",
            ];
          })}
        />
      }
      note={pending ? <span aria-live="polite">Updating intervals…</span> : undefined}
    >
      <div ref={ref} className="relative">
        <svg width={width} height={height} role="img" aria-label={title} className="block">
          <line x1={x(0)} x2={x(0)} y1={0} y2={height - 22} stroke="var(--color-ink)" />
          {x.ticks(4).map((t) => (
            <text
              key={t}
              x={x(t)}
              y={height - 6}
              textAnchor="middle"
              fontSize={10.5}
              fill="var(--color-muted)"
            >
              {moneyCompact(t)}
            </text>
          ))}
          {rows.map((row, i) => {
            const y0 = i * ROW + 6;
            const ci = intervals?.[row.id];
            const bar = { x: Math.min(x(0), x(row.realized)), w: Math.abs(x(row.realized) - x(0)) };
            const oracle = row.kind === "oracle";
            const labelX =
              row.realized > 0 ? Math.max(x(row.realized), ci ? x(ci.high) : 0) + 8 : x(0) + 8;
            return (
              <g
                key={row.id}
                onPointerEnter={() => {
                  setHover(i);
                }}
                onPointerLeave={() => {
                  setHover(null);
                }}
              >
                <rect
                  x={0}
                  y={y0 - 5}
                  width={width}
                  height={ROW - 2}
                  fill={row.deployed || hover === i ? "var(--color-surface)" : "transparent"}
                />
                <rect
                  x={bar.x}
                  y={y0}
                  width={bar.w}
                  height={18}
                  rx={3}
                  fill={
                    oracle
                      ? "none"
                      : row.realized >= 0
                        ? "var(--color-profit)"
                        : "var(--color-loss)"
                  }
                  opacity={row.kind === "random" ? 0.45 : 1}
                  stroke={oracle ? "var(--color-muted)" : undefined}
                  strokeDasharray={oracle ? "3 3" : undefined}
                />
                {ci && !oracle && (
                  <g stroke="var(--color-ink)" strokeWidth={1.5}>
                    <line x1={x(ci.low)} x2={x(ci.high)} y1={y0 + 9} y2={y0 + 9} />
                    <line x1={x(ci.low)} x2={x(ci.low)} y1={y0 + 4} y2={y0 + 14} />
                    <line x1={x(ci.high)} x2={x(ci.high)} y1={y0 + 4} y2={y0 + 14} />
                  </g>
                )}
                <text
                  x={LABEL - 10}
                  y={y0 + 13}
                  textAnchor="end"
                  fontSize={12.5}
                  fontWeight={row.deployed ? 700 : 400}
                  fill="var(--color-ink)"
                >
                  {row.label}
                </text>
                <text
                  x={labelX}
                  y={y0 + 13}
                  fontSize={12}
                  fontWeight={row.deployed ? 700 : 400}
                  fill="var(--color-ink)"
                >
                  {money(row.realized)}
                </text>
              </g>
            );
          })}
        </svg>
        {hover !== null && rows[hover] && (
          <Tooltip x={x(Math.max(0, rows[hover].realized))} y={hover * ROW} width={width}>
            <b>{rows[hover].label}</b>
            <br />
            {count(rows[hover].k)} customers called
            <br />
            Realized {money(rows[hover].realized)}
            {intervals?.[rows[hover].id] && (
              <>
                <br />
                95% interval {moneyCompact(intervals[rows[hover].id]?.low ?? 0)} to{" "}
                {moneyCompact(intervals[rows[hover].id]?.high ?? 0)}
              </>
            )}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
