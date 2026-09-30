/**
 * Drift (spec §5.5): population stability (PSI) of every feature at every cutoff against the
 * training months, one sequential hue in five steps at the thresholds 0.1, 0.25, 0.5 and 1.
 * The most shifted features come first.
 */
import { useState } from "react";

import { MAGNITUDE } from "@/charts/palette.ts";
import { ChartFrame, DataTable, Tooltip, useWidth } from "@/charts/primitives.tsx";
import type { EvaluationFile } from "@/contract/index.ts";
import { featureName } from "@/domain/featureNames.ts";
import { driftMatrix, driftTitle, PSI_THRESHOLDS, psiLevel } from "@/domain/model.ts";

const LEVEL_COLOR = [1, 3, 5, 6, 7].map((i) => MAGNITUDE.ramp[i] ?? MAGNITUDE.none);
const LEVEL_TEXT = ["stable", "slight", "moderate", "large", "severe"];
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const month = (iso: string) => MONTH.format(new Date(`${iso}T00:00:00Z`));
const TOP = 8;
const ROW = 18;

export function DriftMap({ drift }: { drift: EvaluationFile["drift"] }) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [hover, setHover] = useState<{ f: number; c: number } | null>(null);
  const matrix = driftMatrix(drift);
  const labels = width < 560 ? 112 : 196;
  const cell = matrix.cutoffs.length > 0 ? (width - labels) / matrix.cutoffs.length : 0;
  const height = TOP + matrix.features.length * ROW + 36;
  const every = Math.max(1, Math.ceil(56 / Math.max(cell, 1))); // one axis label per ~56 px
  const cellValue = hover === null ? null : (matrix.psi[hover.f]?.[hover.c] ?? null);
  const legend = [
    `below ${PSI_THRESHOLDS[0]}`,
    `${PSI_THRESHOLDS[0]} to ${PSI_THRESHOLDS[1]}`,
    `${PSI_THRESHOLDS[1]} to ${PSI_THRESHOLDS[2]}`,
    `${PSI_THRESHOLDS[2]} to ${PSI_THRESHOLDS[3]}`,
    `${PSI_THRESHOLDS[3]} or more`,
  ];

  return (
    <ChartFrame
      title={driftTitle(matrix)}
      subtitle="Population stability index (PSI) of each feature at each monthly cutoff, against the training months. Darker means the feature's distribution moved further."
      legend={
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          {legend.map((text, level) => (
            <span key={text} className="inline-flex items-center gap-1.5">
              <span
                aria-hidden
                className="inline-block size-3 rounded-[2px]"
                style={{ background: LEVEL_COLOR[level] }}
              />
              {text} ({LEVEL_TEXT[level]})
            </span>
          ))}
          <span className="inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className="inline-block size-3 rounded-[2px]"
              style={{ background: MAGNITUDE.none }}
            />
            not measured
          </span>
        </p>
      }
      table={
        <DataTable
          columns={["Feature", ...matrix.cutoffs.map(month)]}
          rows={matrix.features.map((feature, f) => [
            featureName(feature),
            ...(matrix.psi[f] ?? []).map((v) => (v === null ? "–" : v.toFixed(2))),
          ])}
        />
      }
    >
      <div ref={ref} className="relative">
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={`PSI of ${matrix.features.length} features at ${matrix.cutoffs.length} cutoffs.`}
          className="block max-w-full"
          onPointerLeave={() => {
            setHover(null);
          }}
        >
          {matrix.features.map((feature, f) => (
            <g key={feature}>
              <text
                x={labels - 8}
                y={TOP + f * ROW + ROW / 2}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="var(--color-ink)"
              >
                {featureName(feature)}
              </text>
              {matrix.cutoffs.map((cutoff, c) => {
                const value = matrix.psi[f]?.[c] ?? null;
                return (
                  <rect
                    key={cutoff}
                    x={labels + c * cell + 1}
                    y={TOP + f * ROW + 1}
                    width={Math.max(0, cell - 2)}
                    height={ROW - 2}
                    rx={2}
                    fill={value === null ? MAGNITUDE.none : LEVEL_COLOR[psiLevel(value)]}
                    onPointerEnter={() => {
                      setHover({ f, c });
                    }}
                  />
                );
              })}
            </g>
          ))}
          {matrix.cutoffs.map((cutoff, c) =>
            c % every === 0 ? (
              <text
                key={cutoff}
                x={labels + c * cell + cell / 2}
                y={TOP + matrix.features.length * ROW + 16}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {month(cutoff)}
              </text>
            ) : null,
          )}
        </svg>
        {hover && (
          <Tooltip x={labels + hover.c * cell + cell / 2} y={TOP + hover.f * ROW} width={width}>
            <b>{featureName(matrix.features[hover.f] ?? "")}</b>
            <br />
            {month(matrix.cutoffs[hover.c] ?? "")}
            <br />
            {cellValue === null
              ? "not measured"
              : `PSI ${cellValue.toFixed(2)}, ${LEVEL_TEXT[psiLevel(cellValue)] ?? ""}`}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
