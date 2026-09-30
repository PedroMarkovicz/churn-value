/** p against the customer's break-even p* (spec §5.4, item 3), the "worth a call" side tinted. */
import { BoxSwatch, useWidth } from "@/charts/primitives.tsx";
import { gaugeSentence } from "@/domain/customerText.ts";
import { percent } from "@/domain/format.ts";

const PAD = 8;

export function Gauge({ p, breakEven }: { p: number; breakEven: number }) {
  const [ref, width] = useWidth<HTMLDivElement>(392);
  const x = (v: number) => PAD + Math.min(1, Math.max(0, v)) * (width - 2 * PAD);
  const defined = Number.isFinite(breakEven) && breakEven <= 1; // else no chance makes a call pay
  const from = defined ? Math.max(0, breakEven) : 1;
  const anchor = x(from) < 70 ? "start" : x(from) > width - 70 ? "end" : "middle";
  return (
    <div ref={ref}>
      <p className="text-sm leading-relaxed">{gaugeSentence(p, breakEven)}</p>
      <svg aria-hidden width={width} height={48} className="mt-2 block max-w-full">
        <rect x={PAD} y={14} width={width - 2 * PAD} height={8} rx={4} fill="var(--color-rule)" />
        {defined && from < 1 && (
          <rect
            x={x(from)}
            y={14}
            width={x(1) - x(from)}
            height={8}
            rx={4}
            fill="var(--color-profit-tint)"
            stroke="var(--color-profit)"
          />
        )}
        {defined && (
          <>
            <line
              x1={x(from)}
              x2={x(from)}
              y1={8}
              y2={28}
              stroke="var(--color-ink)"
              strokeWidth={1.5}
            />
            <text x={x(from)} y={42} textAnchor={anchor} fontSize={12} fill="var(--color-muted)">
              break-even {percent(breakEven, 1)}
            </text>
          </>
        )}
        <circle
          cx={x(p)}
          cy={18}
          r={6}
          fill="var(--color-ink)"
          stroke="var(--color-panel)"
          strokeWidth={2}
        />
      </svg>
      <p className="mt-1 flex items-center justify-between text-xs text-muted">
        <span>0% chance of leaving</span>
        <span className="inline-flex items-center gap-1.5">
          <BoxSwatch color="var(--color-profit-tint)" /> worth a call
        </span>
        <span>100%</span>
      </p>
    </div>
  );
}
