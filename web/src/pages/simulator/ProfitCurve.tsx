/**
 * Cumulative profit as customers are added best first (spec §5.2): expected (dashed) against
 * realized on the holdout (solid). A crosshair follows the pointer or the arrow keys.
 */
import { scaleLinear } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { useState } from "react";

import {
  ChartFrame,
  DataTable,
  LegendItem,
  LineSwatch,
  Tooltip,
  useWidth,
} from "@/charts/primitives.tsx";
import type { Campaign } from "@/domain/campaign.ts";
import { count, money, moneyCompact, moneyPrecise } from "@/domain/format.ts";

const HEIGHT = 300;
const M = { top: 16, right: 16, bottom: 40, left: 56 };

function argmax(values: Float64Array): number {
  let best = 0;
  for (let i = 1; i < values.length; i++)
    if ((values[i] as number) > (values[best] as number)) best = i;
  return best;
}

export function ProfitCurve({ campaign, n }: { campaign: Campaign; n: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [cursor, setCursor] = useState<number | null>(null);
  const { cumExpected, cumRealized, k } = campaign;

  let lo = 0;
  let hi = 0;
  for (let i = 0; i <= n; i++) {
    lo = Math.min(lo, cumExpected[i] as number, cumRealized[i] as number);
    hi = Math.max(hi, cumExpected[i] as number, cumRealized[i] as number);
  }
  const x = scaleLinear({ domain: [0, n], range: [M.left, width - M.right] });
  const y = scaleLinear({
    domain: [lo * 1.05, hi * 1.15 || 1],
    range: [HEIGHT - M.bottom, M.top],
    nice: true,
  });
  const zero = y(0);
  const points = Array.from({ length: n + 1 }, (_, i) => i);
  const best = argmax(cumRealized);
  const xTicks = [0, ...x.ticks(4).filter((t) => t > 0 && t < n * 0.95), n];

  const at = cursor ?? k;
  const next = at < n ? campaign.order[at] : undefined;
  const tooltip = cursor !== null && (
    <Tooltip x={x(cursor)} y={y(cumExpected[cursor] as number)} width={width}>
      <b>Call the top {count(cursor)}</b>
      <br />
      Expected {money(cumExpected[cursor] as number)}
      <br />
      Realized {money(cumRealized[cursor] as number)}
      {next !== undefined && (
        <>
          <br />
          Customer {count(cursor + 1)}: {moneyPrecise(campaign.expProfit[next] ?? 0)} expected
        </>
      )}
    </Tooltip>
  );

  const rows = [
    ...new Set([0, ...Array.from({ length: Math.floor(n / 100) }, (_, i) => (i + 1) * 100), k, n]),
  ]
    .sort((a, b) => a - b)
    .map((i) => [count(i), money(cumExpected[i] as number), money(cumRealized[i] as number)]);

  return (
    <ChartFrame
      title="Profit rises until the list runs out of customers worth calling"
      subtitle="Cumulative profit as customers are added best first. The gap between the lines is how far the holdout fell short of the model's promise."
      legend={
        <div className="flex flex-wrap gap-5 text-xs text-muted">
          <LegendItem swatch={<LineSwatch dashed />}>expected</LegendItem>
          <LegendItem swatch={<LineSwatch />}>realized on the holdout</LegendItem>
        </div>
      }
      table={<DataTable columns={["Customers called", "Expected", "Realized"]} rows={rows} />}
      note={
        <span>
          On the holdout the best cut would have been {count(best)} customers (
          {money(cumRealized[best] as number)}); the rule stops at {count(k)}.
        </span>
      }
    >
      <div ref={ref} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Profit curve. Calling the top ${count(k)} is expected to earn ${money(cumExpected[k] as number)} and realized ${money(cumRealized[k] as number)}; calling all ${count(n)} realized ${money(cumRealized[n] as number)}.`}
          tabIndex={0}
          className="block overflow-visible"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const value = Math.round(x.invert(event.clientX - box.left));
            setCursor(Math.max(0, Math.min(n, value)));
          }}
          onPointerLeave={() => {
            setCursor(null);
          }}
          onBlur={() => {
            setCursor(null);
          }}
          onKeyDown={(event) => {
            const step = event.shiftKey ? 50 : 1;
            const moves: Record<string, number> = {
              ArrowRight: step,
              ArrowLeft: -step,
              Home: -n,
              End: n,
            };
            const move = moves[event.key];
            if (move === undefined) return;
            event.preventDefault();
            setCursor((c) => Math.max(0, Math.min(n, (c ?? k) + move)));
          }}
        >
          <rect
            x={M.left}
            y={M.top}
            width={width - M.left - M.right}
            height={Math.max(0, zero - M.top)}
            fill="var(--color-profit)"
            opacity={0.05}
          />
          <rect
            x={M.left}
            y={zero}
            width={width - M.left - M.right}
            height={Math.max(0, HEIGHT - M.bottom - zero)}
            fill="var(--color-loss)"
            opacity={0.05}
          />
          {y.ticks(5).map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={width - M.right}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "var(--color-ink)" : "var(--color-rule)"}
              />
              <text
                x={M.left - 8}
                y={y(t) + 4}
                textAnchor="end"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {moneyCompact(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t) => (
            <text
              key={t}
              x={x(t)}
              y={HEIGHT - M.bottom + 16}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-muted)"
            >
              {count(t)}
            </text>
          ))}
          <text
            x={(M.left + width - M.right) / 2}
            y={HEIGHT - 4}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-muted)"
          >
            customers called, best first
          </text>
          <LinePath
            data={points}
            x={(i) => x(i)}
            y={(i) => y(cumExpected[i] as number)}
            stroke="var(--color-ink)"
            strokeWidth={2}
            strokeDasharray="5 4"
            fill="none"
          />
          <LinePath
            data={points}
            x={(i) => x(i)}
            y={(i) => y(cumRealized[i] as number)}
            stroke="var(--color-ink)"
            strokeWidth={2}
            fill="none"
          />
          <line
            x1={x(k)}
            x2={x(k)}
            y1={M.top}
            y2={HEIGHT - M.bottom}
            stroke="var(--color-ink)"
            opacity={0.4}
          />
          <circle
            cx={x(k)}
            cy={y(cumExpected[k] as number)}
            r={5}
            fill="var(--color-panel)"
            stroke="var(--color-ink)"
            strokeWidth={2}
          />
          <circle
            cx={x(k)}
            cy={y(cumRealized[k] as number)}
            r={5}
            fill="var(--color-ink)"
            stroke="var(--color-panel)"
            strokeWidth={2}
          />
          <text
            x={x(n) - 4}
            y={y(cumRealized[n] as number) - 8}
            textAnchor="end"
            fontSize={11.5}
            fill="var(--color-ink)"
          >
            call everyone {money(cumRealized[n] as number)}
          </text>
          {cursor !== null && (
            <line
              x1={x(cursor)}
              x2={x(cursor)}
              y1={M.top}
              y2={HEIGHT - M.bottom}
              stroke="var(--color-accent)"
            />
          )}
        </svg>
        {tooltip}
      </div>
    </ChartFrame>
  );
}
