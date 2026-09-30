/**
 * Purchase history (spec §5.4, item 5): purchase days as dots sized by spend, the "due" point
 * (last purchase + usual gap), the cutoff and the 90-day window. Purchases after the cutoff are
 * the outcome, drawn only when the page reveals outcomes.
 */
import { scaleLinear } from "@visx/scale";
import { useState } from "react";

import { ChartFrame, DataTable, LegendItem, Tooltip, useWidth } from "@/charts/primitives.tsx";
import type { Timeline } from "@/contract/index.ts";
import { dueSentence } from "@/domain/customerText.ts";
import { count, days, moneyPrecise } from "@/domain/format.ts";
import { outcomeLine, type Purchase, visiblePurchases } from "@/domain/history.ts";

const HEIGHT = 128;
const AXIS = 96; // y of the time axis
const DOTS = 70; // y of the purchase dots

interface Props {
  timeline: Timeline;
  recencyDays: number;
  cadenceDays: number;
  horizonDays: number;
  churned: boolean;
  revealed: boolean;
}

const when = (day: number) =>
  day < 0 ? `${days(-day)} before the cutoff` : `${days(day)} after the cutoff`;

function Dot({ filled }: { filled: boolean }) {
  return (
    <svg aria-hidden width={10} height={10} className="inline-block">
      <circle
        cx={5}
        cy={5}
        r={4}
        fill={filled ? "var(--color-ink)" : "none"}
        stroke="var(--color-ink)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

export function PurchaseHistory({
  timeline,
  recencyDays,
  cadenceDays,
  horizonDays,
  churned,
  revealed,
}: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(392);
  const [hover, setHover] = useState<(Purchase & { x: number; y: number }) | null>(null);
  const purchases = visiblePurchases(timeline, revealed);
  const due = cadenceDays - recencyDays; // days after the cutoff; negative when overdue
  const first = Math.min(-recencyDays, ...purchases.map((p) => p.day));
  const x = scaleLinear<number>({
    domain: [first - 8, Math.max(horizonDays, due) + 8],
    range: [12, width - 12],
  });
  const top = Math.max(1, ...purchases.map((p) => p.revenue));
  const radius = (revenue: number) => 3 + 6 * Math.sqrt(Math.max(0, revenue) / top);
  const ticks: number[] = [];
  for (let day = -180; day >= first; day -= 180) ticks.push(day);

  return (
    <ChartFrame
      level={3}
      title={dueSentence(recencyDays, cadenceDays)}
      subtitle={`Purchase history. Each dot is a purchase day, sized by spend. They reorder about every ${days(cadenceDays)}.`}
      legend={
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <LegendItem swatch={<Dot filled />}>before the cutoff</LegendItem>
          {revealed && <LegendItem swatch={<Dot filled={false} />}>after the cutoff</LegendItem>}
        </p>
      }
      table={
        <DataTable
          columns={["When", "Spend"]}
          rows={purchases.map((p) => [when(p.day), moneyPrecise(p.revenue)])}
        />
      }
      note={
        revealed
          ? outcomeLine(timeline, churned, horizonDays)
          : "What happened after the cutoff stays hidden until you turn on Show what happened."
      }
    >
      <div ref={ref} className="relative">
        <svg
          role="img"
          aria-label={`${count(purchases.length)} purchase days, the last ${days(recencyDays)} before the cutoff.`}
          width={width}
          height={HEIGHT}
          className="block max-w-full"
        >
          <rect
            x={x(0)}
            y={18}
            width={x(horizonDays) - x(0)}
            height={AXIS - 18}
            fill="var(--color-surface)"
          />
          <text x={x(0) + 4} y={30} fontSize={11} fill="var(--color-muted)">
            next {count(horizonDays)} days
          </text>
          <line x1={x(0)} x2={x(0)} y1={12} y2={AXIS + 4} stroke="var(--color-ink)" />
          <line
            x1={x(due)}
            x2={x(due)}
            y1={40}
            y2={AXIS}
            stroke="var(--color-muted)"
            strokeDasharray="3 3"
          />
          <text x={x(due)} y={50} textAnchor="middle" fontSize={11} fill="var(--color-muted)">
            due
          </text>
          <line x1={x(first - 8)} x2={width - 12} y1={AXIS} y2={AXIS} stroke="var(--color-rule)" />
          {ticks.map((day) => (
            <text
              key={day}
              x={x(day)}
              y={AXIS + 18}
              textAnchor="middle"
              fontSize={11}
              fill="var(--color-muted)"
            >
              {`−${count(-day)} d`}
            </text>
          ))}
          <text x={x(0)} y={AXIS + 18} textAnchor="middle" fontSize={11} fill="var(--color-ink)">
            cutoff
          </text>
          {purchases.map((p) => (
            <circle
              key={p.day}
              data-day={p.day}
              cx={x(p.day)}
              cy={DOTS}
              r={radius(p.revenue)}
              fill={p.day > 0 ? "var(--color-panel)" : "var(--color-ink)"}
              fillOpacity={p.day > 0 ? 1 : 0.75}
              stroke="var(--color-ink)"
              strokeWidth={1.5}
              onPointerEnter={() => {
                setHover({ ...p, x: x(p.day), y: DOTS });
              }}
              onPointerLeave={() => {
                setHover(null);
              }}
            />
          ))}
        </svg>
        {hover && (
          <Tooltip x={hover.x} y={hover.y} width={width}>
            {when(hover.day)}
            <br />
            {moneyPrecise(hover.revenue)}
          </Tooltip>
        )}
      </div>
    </ChartFrame>
  );
}
