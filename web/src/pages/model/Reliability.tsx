/**
 * Reliability (spec §5.5): mean predicted churn against the share that churned, per probability
 * bin on the holdout, circles sized by customers, the diagonal as perfect calibration. A selector
 * picks the model; it starts on the served one.
 */
import { scaleLinear, scaleSqrt } from "@visx/scale";
import { useId, useState } from "react";

import { modelColor } from "@/charts/palette.ts";
import { ChartFrame, DataTable, Tooltip, useWidth } from "@/charts/primitives.tsx";
import type { EvaluationFile, ModelInfo } from "@/contract/index.ts";
import { monthName } from "@/domain/customerText.ts";
import { count, percent } from "@/domain/format.ts";
import { reliabilityPoints, reliabilityTitle } from "@/domain/model.ts";

const M = { top: 12, right: 16, bottom: 40, left: 48 };

interface Props {
  evaluation: EvaluationFile;
  models: ModelInfo[];
  deployed: string;
  testCutoff: string;
}

export function Reliability({ evaluation, models, deployed, testCutoff }: Props) {
  const selectId = useId();
  const [ref, width] = useWidth<HTMLDivElement>(560);
  const [name, setName] = useState(deployed);
  const [hover, setHover] = useState<number | null>(null);
  const position = Math.max(
    0,
    models.findIndex((m) => m.name === name),
  );
  const model = models[position];
  const label = model?.label ?? name;
  const color = modelColor(position) ?? "var(--color-ink)";
  const points = reliabilityPoints(evaluation, name);
  const size = Math.min(width, 380);
  const x = scaleLinear<number>({ domain: [0, 1], range: [M.left, size - M.right] });
  const y = scaleLinear<number>({ domain: [0, 1], range: [size - M.bottom, M.top] });
  const r = scaleSqrt<number>({
    domain: [0, Math.max(1, ...points.map((p) => p.n))],
    range: [0, 16],
  });
  const hovered = hover === null ? null : (points[hover] ?? null);
  const options = models.filter((m) => evaluation.models[m.name] !== undefined);
  const missing = models.filter((m) => evaluation.models[m.name] === undefined);

  return (
    <ChartFrame
      title={reliabilityTitle(points, label)}
      subtitle={`Mean predicted churn against the share that churned, per probability bin on the ${monthName(testCutoff)} holdout. Circles are sized by customers; the diagonal is a perfect match.`}
      legend={
        <label htmlFor={selectId} className="flex items-center gap-2 text-sm">
          Model
          <select
            id={selectId}
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              setHover(null);
            }}
            className="rounded-md bg-panel px-2 py-1 shadow-[inset_0_0_0_1px_var(--color-rule)]"
          >
            {options.map((m) => (
              <option key={m.name} value={m.name}>
                {m.label}
              </option>
            ))}
          </select>
        </label>
      }
      table={
        <DataTable
          columns={["Bin", "Customers", "Predicted", "Observed"]}
          rows={points.map((p) => [
            `${percent(p.low)} to ${percent(p.high)}`,
            count(p.n),
            percent(p.meanP, 1),
            percent(p.observed, 1),
          ])}
        />
      }
      note={
        missing.length > 0
          ? `No reliability data for ${missing.map((m) => m.label).join(", ")}.`
          : undefined
      }
    >
      <div ref={ref} className="relative">
        <svg
          width={size}
          height={size}
          role="img"
          aria-label={`Reliability of ${label}: ${points.length} bins.`}
          className="block max-w-full"
          onPointerLeave={() => {
            setHover(null);
          }}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((t) => (
            <g key={t}>
              <line
                x1={x(t)}
                x2={x(t)}
                y1={M.top}
                y2={size - M.bottom}
                stroke="var(--color-rule)"
              />
              <line
                x1={M.left}
                x2={size - M.right}
                y1={y(t)}
                y2={y(t)}
                stroke="var(--color-rule)"
              />
              <text
                x={x(t)}
                y={size - M.bottom + 16}
                textAnchor="middle"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {percent(t)}
              </text>
              <text
                x={M.left - 8}
                y={y(t)}
                dy="0.32em"
                textAnchor="end"
                fontSize={11}
                fill="var(--color-muted)"
              >
                {percent(t)}
              </text>
            </g>
          ))}
          <line
            x1={x(0)}
            y1={y(0)}
            x2={x(1)}
            y2={y(1)}
            stroke="var(--color-muted)"
            strokeDasharray="4 4"
          />
          <text
            x={(M.left + size - M.right) / 2}
            y={size - 6}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-muted)"
          >
            predicted
          </text>
          {points.map((p, i) => (
            <circle
              key={p.low}
              cx={x(p.meanP)}
              cy={y(p.observed)}
              r={Math.max(3, r(p.n))}
              fill={color}
              fillOpacity={0.75}
              stroke="var(--color-panel)"
              onPointerEnter={() => {
                setHover(i);
              }}
            />
          ))}
        </svg>
        {hovered && (
          <Tooltip x={x(hovered.meanP)} y={y(hovered.observed)} width={size}>
            <b>
              {percent(hovered.low)} to {percent(hovered.high)}
            </b>
            <br />
            {count(hovered.n)} customers
            <br />
            Predicted {percent(hovered.meanP, 1)}, observed {percent(hovered.observed, 1)}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
