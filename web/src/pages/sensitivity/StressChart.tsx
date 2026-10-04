/**
 * What the list earns at every true acceptance rate (spec §5.3): the list built for the assumed
 * rate (solid) against a list rebuilt for each rate (dashed); the loss region shaded.
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
import { money, moneyCompact, percent } from "@/domain/format.ts";
import type { AcceptanceLine, BreakEven, StressPoint } from "@/domain/stress.ts";

const HEIGHT = 300;
const M = { top: 22, right: 16, bottom: 42, left: 56 };

export function StressChart({
  line,
  breakEven,
  assumed,
  rebuilt,
}: {
  line: AcceptanceLine;
  breakEven: BreakEven;
  assumed: number; // the scenario's acceptance
  rebuilt: StressPoint[] | null; // from the worker; null while the first result is on its way
}) {
  const [ref, width] = useWidth<HTMLDivElement>(900);
  const [wide, setWide] = useState(false);
  const [cursor, setCursor] = useState<number | null>(null);
  const max = wide ? 1 : 0.6;
  const fixed = (gamma: number) => gamma * line.gain - line.loss;
  const shown = (rebuilt ?? []).filter((p) => p.gamma <= max + 1e-9);
  const values = [fixed(0), fixed(max), ...shown.map((p) => p.rebuilt), 0];
  const x = scaleLinear({ domain: [0, max], range: [M.left, width - M.right] });
  const y = scaleLinear({
    domain: [Math.min(...values) * 1.1, Math.max(...values) * 1.1 || 1],
    range: [HEIGHT - M.bottom, M.top],
    nice: true,
  });
  const gammaStar = breakEven.kind === "rate" ? breakEven.gamma : null;
  const margin = gammaStar !== null ? assumed - gammaStar : null;

  return (
    <ChartFrame
      title={
        margin !== null && margin > 0
          ? `Acceptance can fall ${(margin * 100).toFixed(1)} points before this list loses money`
          : "What this list earns at every true acceptance rate"
      }
      subtitle="Realized profit on the holdout of the list built for the assumed acceptance, if the true rate were different. Shaded: the rates at which this list loses money."
      legend={
        <div className="flex flex-wrap items-center gap-5 text-xs text-muted">
          <LegendItem swatch={<LineSwatch />}>this list</LegendItem>
          <LegendItem swatch={<LineSwatch dashed color="var(--color-muted)" />}>
            a list rebuilt for the true rate
          </LegendItem>
          <button
            type="button"
            className="ml-auto font-semibold text-accent"
            onClick={() => {
              setWide((w) => !w);
            }}
          >
            {wide ? "Show 0 to 60%" : "Show 0 to 100%"}
          </button>
        </div>
      }
      table={
        <DataTable
          columns={["True acceptance", "This list", "Rebuilt list"]}
          rows={(rebuilt ?? [])
            .filter((_, i) => i % 5 === 0)
            .map((p) => [percent(p.gamma), money(fixed(p.gamma)), money(p.rebuilt)])}
        />
      }
    >
      <div ref={ref} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Stress test. The list breaks even at ${gammaStar === null ? "no rate" : percent(gammaStar, 1)} acceptance; at the assumed ${percent(assumed)} it earns ${money(fixed(assumed))}.`}
          className="block"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const gamma = Math.round(x.invert(event.clientX - box.left) * 100) / 100;
            setCursor(Math.max(0, Math.min(max, gamma)));
          }}
          onPointerLeave={() => {
            setCursor(null);
          }}
        >
          {gammaStar !== null && gammaStar > 0 && (
            <rect
              x={M.left}
              y={M.top}
              width={Math.max(0, x(Math.min(gammaStar, max)) - M.left)}
              height={HEIGHT - M.top - M.bottom}
              fill="var(--color-loss)"
              opacity={0.07}
            />
          )}
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
          {x.ticks(wide ? 5 : 6).map((t) => (
            <text
              key={t}
              x={x(t)}
              y={HEIGHT - M.bottom + 16}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-muted)"
            >
              {percent(t)}
            </text>
          ))}
          <text
            x={(M.left + width - M.right) / 2}
            y={HEIGHT - 4}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-muted)"
          >
            {width < 340
              ? "true acceptance rate"
              : "share of contacted churners who actually accept"}
          </text>
          {shown.length > 0 && (
            <LinePath
              data={shown}
              x={(p) => x(p.gamma)}
              y={(p) => y(p.rebuilt)}
              stroke="var(--color-muted)"
              strokeWidth={2}
              strokeDasharray="5 4"
              fill="none"
            />
          )}
          <line
            x1={x(0)}
            x2={x(max)}
            y1={y(fixed(0))}
            y2={y(fixed(max))}
            stroke="var(--color-ink)"
            strokeWidth={2}
          />
          {assumed <= max && (
            <g>
              <circle
                cx={x(assumed)}
                cy={y(fixed(assumed))}
                r={5}
                fill="var(--color-ink)"
                stroke="var(--color-panel)"
                strokeWidth={2}
              />
              <text
                x={x(assumed) + 9}
                y={y(fixed(assumed)) + 18}
                fontSize={11.5}
                fill="var(--color-ink)"
              >
                {/* on a narrow chart only the amount fits beside the point */}
                {width < 340
                  ? money(fixed(assumed))
                  : `assumed ${percent(assumed)}: ${money(fixed(assumed))}`}
              </text>
            </g>
          )}
          {gammaStar !== null && gammaStar <= max && (
            <g>
              <circle
                cx={x(gammaStar)}
                cy={y(0)}
                r={5}
                fill="var(--color-panel)"
                stroke="var(--color-loss)"
                strokeWidth={2}
              />
              <text x={x(gammaStar) + 10} y={y(0) + 18} fontSize={11.5} fill="var(--color-ink)">
                break-even {percent(gammaStar, 1)}
              </text>
            </g>
          )}
          {margin !== null && margin > 0 && gammaStar !== null && assumed <= max && (
            <g>
              <line
                x1={x(gammaStar)}
                x2={x(assumed)}
                y1={y(fixed(assumed)) - 16}
                y2={y(fixed(assumed)) - 16}
                stroke="var(--color-ink)"
              />
              <text
                x={(x(gammaStar) + x(assumed)) / 2}
                y={y(fixed(assumed)) - 22}
                textAnchor="middle"
                fontSize={11.5}
                fontWeight={600}
                fill="var(--color-ink)"
              >
                {(margin * 100).toFixed(1)} points of margin
              </text>
            </g>
          )}
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
        {cursor !== null && (
          <Tooltip x={x(cursor)} y={y(fixed(cursor))} width={width}>
            <b>True acceptance {percent(cursor)}</b>
            <br />
            This list {money(fixed(cursor))}
            {rebuilt && (
              <>
                <br />
                Rebuilt list {money(rebuilt[Math.round(cursor * 100)]?.rebuilt ?? 0)}
              </>
            )}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
