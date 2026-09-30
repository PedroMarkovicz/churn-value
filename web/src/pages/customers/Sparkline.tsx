/**
 * A customer's last year of purchase days as ticks, taller for more spend; with outcomes revealed,
 * the 90 days after the cutoff too. Decorative: the row says it in words for screen readers.
 */
import type { Timeline } from "@/contract/index.ts";
import { count } from "@/domain/format.ts";
import { visiblePurchases } from "@/domain/history.ts";

const WIDTH = 104;
const HEIGHT = 22;
const PAST = 365;

export function Sparkline({ timeline, revealed }: { timeline: Timeline; revealed: boolean }) {
  const future = revealed ? 90 : 0;
  const purchases = visiblePurchases(timeline, revealed).filter((p) => p.day >= -PAST);
  const x = (day: number) => ((day + PAST) / (PAST + future)) * (WIDTH - 4) + 2;
  const top = Math.max(1, ...purchases.map((p) => p.revenue));
  const before = purchases.filter((p) => p.day <= 0).length;
  return (
    <span className="inline-flex items-center">
      <svg aria-hidden width={WIDTH} height={HEIGHT} className="block">
        <line x1={0} x2={WIDTH} y1={HEIGHT - 0.5} y2={HEIGHT - 0.5} stroke="var(--color-rule)" />
        {revealed && (
          <line
            x1={x(0)}
            x2={x(0)}
            y1={0}
            y2={HEIGHT}
            stroke="var(--color-muted)"
            strokeDasharray="2 2"
          />
        )}
        {purchases.map((p) => {
          const h = 3 + (HEIGHT - 6) * Math.sqrt(Math.max(0, p.revenue) / top);
          return (
            <rect
              key={p.day}
              x={x(p.day) - 1}
              y={HEIGHT - 1 - h}
              width={2}
              height={h}
              rx={1}
              fill={p.day > 0 ? "var(--color-profit)" : "var(--color-muted)"}
            />
          );
        })}
      </svg>
      <span className="sr-only">
        {count(before)} purchase {before === 1 ? "day" : "days"} in the year before the cutoff
      </span>
    </span>
  );
}
