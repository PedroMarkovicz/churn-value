/**
 * Calibration over time (spec §5.5, the page's main chart): mean predicted minus actual churn, in
 * points, at each cutoff after training, one line per model in ladder colours. The ±3.5-point
 * band is "calibrated"; the calibration and test months are marked; each line ends in a direct
 * label with its last gap. Arrow keys move the crosshair.
 */
import { scaleLinear, scalePoint } from "@visx/scale";
import { LinePath } from "@visx/shape";
import { useState } from "react";

import { modelColor } from "@/charts/palette.ts";
import {
  ChartFrame,
  DataTable,
  LegendItem,
  LineSwatch,
  spreadPositions,
  Tooltip,
  useWidth,
} from "@/charts/primitives.tsx";
import type { ModelInfo } from "@/contract/index.ts";
import { count, points } from "@/domain/format.ts";
import { CALIBRATION_BAND, calibrationTitle, type GapSeries } from "@/domain/model.ts";

const HEIGHT = 320;
const M = { top: 32, right: 176, bottom: 32, left: 48 };
const MONTH = new Intl.DateTimeFormat("en-GB", { month: "short", timeZone: "UTC" });
const month = (iso: string) => MONTH.format(new Date(`${iso}T00:00:00Z`));

interface Props {
  series: GapSeries[];
  missing: ModelInfo[];
  calibrationCutoff: string;
  testCutoff: string;
}

export function CalibrationOverTime({ series, missing, calibrationCutoff, testCutoff }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<number | null>(null); // index into cutoffs
  const drawn = series.filter((s) => modelColor(s.position) !== null); // a ninth model: table only
  const cutoffs = [...new Set(series.flatMap((s) => s.points.map((p) => p.cutoff)))].sort();
  const labelled = width >= 560; // on a phone the direct labels give way; the legend stays
  const right = labelled ? M.right : 16;
  const x = scalePoint<string>({ domain: cutoffs, range: [M.left, width - right], padding: 0.4 });
  const px = (cutoff: string) => x(cutoff) ?? M.left;
  const gaps = series.flatMap((s) => s.points.map((p) => p.gap));
  const y = scaleLinear<number>({
    domain: [Math.min(-0.05, ...gaps) - 0.01, Math.max(0.05, ...gaps) + 0.01],
    range: [HEIGHT - M.bottom, M.top],
    nice: true,
  });
  const ends = spreadPositions(
    Object.fromEntries(
      drawn.flatMap((s) => {
        const last = s.points.at(-1);
        return last ? [[s.model.name, y(last.gap)]] : [];
      }),
    ),
    16,
  );
  const cursor = hover === null ? null : (cutoffs[hover] ?? null);
  const marks = [
    { cutoff: calibrationCutoff, text: "calibrated" },
    { cutoff: testCutoff, text: "test" },
  ].filter((m) => cutoffs.includes(m.cutoff));
  const hidden = series.filter((s) => !drawn.includes(s));
  const notes = [
    missing.length > 0
      ? `No calibration history for ${missing.map((m) => m.label).join(", ")}.`
      : "",
    hidden.length > 0 ? `In the table only: ${hidden.map((s) => s.model.label).join(", ")}.` : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <ChartFrame
      title={calibrationTitle(series, calibrationCutoff)}
      subtitle="Average predicted churn minus actual churn, in points, at each monthly cutoff after training. Positive means the model expected more churn than happened; the band is ±3.5 points."
      legend={
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {drawn.map((s) => (
            <LegendItem
              key={s.model.name}
              swatch={<LineSwatch color={modelColor(s.position) ?? "var(--color-muted)"} />}
            >
              {s.model.label}
            </LegendItem>
          ))}
        </p>
      }
      table={
        <DataTable
          columns={["Model", ...cutoffs.map(month)]}
          rows={series.map((s) => [
            s.model.label,
            ...cutoffs.map((c) => {
              const p = s.points.find((q) => q.cutoff === c);
              return p ? points(p.gap) : "–";
            }),
          ])}
        />
      }
      note={notes || undefined}
    >
      <div ref={ref} className="relative">
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={`Calibration gap at each cutoff for ${count(drawn.length)} models; the band is ±3.5 points.`}
          tabIndex={0}
          className="block max-w-full"
          onPointerMove={(event) => {
            const box = event.currentTarget.getBoundingClientRect();
            const at = event.clientX - box.left;
            let best = 0;
            cutoffs.forEach((c, i) => {
              if (Math.abs(px(c) - at) < Math.abs(px(cutoffs[best] ?? c) - at)) best = i;
            });
            setHover(cutoffs.length > 0 ? best : null);
          }}
          onPointerLeave={() => {
            setHover(null);
          }}
          onBlur={() => {
            setHover(null);
          }}
          onKeyDown={(event) => {
            const moves: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
            const move = moves[event.key];
            if (move === undefined || cutoffs.length === 0) return;
            event.preventDefault();
            setHover((h) =>
              Math.max(0, Math.min(cutoffs.length - 1, (h ?? cutoffs.length - 1) + move)),
            );
          }}
        >
          <rect
            x={M.left}
            width={width - right - M.left}
            y={y(CALIBRATION_BAND)}
            height={y(-CALIBRATION_BAND) - y(CALIBRATION_BAND)}
            fill="var(--color-rule)"
            opacity={0.6}
          />
          {y.ticks(5).map((t) => (
            <g key={t}>
              <line
                x1={M.left}
                x2={width - right}
                y1={y(t)}
                y2={y(t)}
                stroke={t === 0 ? "var(--color-ink)" : "var(--color-rule)"}
              />
              <text
                x={M.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {points(t, 0)}
              </text>
            </g>
          ))}
          {cutoffs.map((c) => (
            <text
              key={c}
              x={px(c)}
              y={HEIGHT - 10}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-muted)"
            >
              {month(c)}
            </text>
          ))}
          {marks.map((m) => (
            <g key={m.cutoff}>
              <line
                x1={px(m.cutoff)}
                x2={px(m.cutoff)}
                y1={M.top - 8}
                y2={HEIGHT - M.bottom}
                stroke="var(--color-muted)"
                strokeDasharray="3 3"
              />
              <text
                x={px(m.cutoff)}
                y={M.top - 14}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-ink)"
              >
                {m.text}
              </text>
            </g>
          ))}
          {drawn.map((s) => {
            const color = modelColor(s.position) ?? "var(--color-muted)";
            return (
              <g key={s.model.name}>
                <LinePath
                  data={s.points}
                  x={(p) => px(p.cutoff)}
                  y={(p) => y(p.gap)}
                  stroke={color}
                  strokeWidth={2}
                />
                {s.points.map((p) => (
                  <circle key={p.cutoff} cx={px(p.cutoff)} cy={y(p.gap)} r={3.5} fill={color} />
                ))}
              </g>
            );
          })}
          {labelled &&
            drawn.map((s) => {
              const last = s.points.at(-1);
              if (!last) return null;
              return (
                <text
                  key={s.model.name}
                  x={px(last.cutoff) + 12}
                  y={ends[s.model.name] ?? y(last.gap)}
                  dy="0.32em"
                  fontSize={12}
                  fill="var(--color-ink)"
                >
                  {s.model.label} {points(last.gap)}
                </text>
              );
            })}
          {cursor !== null && (
            <line
              x1={px(cursor)}
              x2={px(cursor)}
              y1={M.top}
              y2={HEIGHT - M.bottom}
              stroke="var(--color-ink)"
              strokeOpacity={0.35}
            />
          )}
        </svg>
        {cursor !== null && (
          <Tooltip x={px(cursor)} y={M.top} width={width}>
            <b>{month(cursor)}</b>
            {drawn.map((s) => {
              const p = s.points.find((q) => q.cutoff === cursor);
              return p ? (
                <span key={s.model.name} className="block">
                  {s.model.label}: {points(p.gap)}
                </span>
              ) : null;
            })}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
