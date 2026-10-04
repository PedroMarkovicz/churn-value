/**
 * How a customer gets a label (spec §5.6; notebook 04, P1): an illustrative customer's purchase
 * days, their cadence, the expected next purchase E, the eligibility window [t − f·H, t + H + f·H]
 * and the label window (t, t + H]. The rule's H and f are the run's own (manifest.pipeline).
 */
import { scaleLinear } from "@visx/scale";

import { useWidth } from "@/charts/primitives.tsx";
import { count } from "@/domain/format.ts";

const PURCHASES = [-170, -125, -80, -35]; // an illustrative customer: one purchase every 45 days
const CADENCE = 45;
const HEIGHT = 200;
const AXIS = 120;

export function LabelDiagram({
  horizonDays,
  eligibilityF,
}: {
  horizonDays: number;
  eligibilityF: number | null;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const h = horizonDays;
  const f = eligibilityF;
  const last = PURCHASES.at(-1) ?? 0;
  const expected = last + CADENCE;
  const x = scaleLinear<number>({
    domain: [-190, h + (f ?? 0.5) * h + 10],
    range: [16, width - 16],
  });
  const summary =
    `An illustrative customer who buys every ${count(CADENCE)} days. At the cutoff t their next purchase is expected ` +
    `${count(expected)} days later${f === null ? "" : `, inside the eligibility window (f = ${f})`}; ` +
    `they count as churned if they buy nothing in the ${count(h)} days after t (H = ${count(h)} days).`;
  return (
    <figure className="rounded-[10px] bg-panel p-5 shadow-[0_0_0_1px_var(--color-rule)]">
      <figcaption className="mb-3">
        <h2 className="font-serif text-2xl leading-tight">How a customer gets a label</h2>
        <span className="mt-1 block text-sm text-muted">
          Only customers who were due to buy again are labelled: their expected next purchase must
          fall near the label window. Then silence in the window is a signal, not a long cycle.
        </span>
      </figcaption>
      <div ref={ref}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={summary}
          className="block max-w-full"
        >
          <rect
            x={x(0)}
            y={34}
            width={x(h) - x(0)}
            height={AXIS - 34}
            fill="var(--color-rule)"
            opacity={0.6}
          />
          <text x={x(0) + 6} y={50} fontSize={11} fill="var(--color-ink)">
            H = {count(h)} days
          </text>
          <line x1={16} x2={width - 16} y1={AXIS} y2={AXIS} stroke="var(--color-ink)" />
          <line
            x1={x(0)}
            x2={x(0)}
            y1={20}
            y2={AXIS + 8}
            stroke="var(--color-ink)"
            strokeWidth={1.5}
          />
          <text x={x(0)} y={AXIS + 22} textAnchor="middle" fontSize={11} fill="var(--color-ink)">
            cutoff t
          </text>
          {PURCHASES.map((day) => (
            <circle key={day} cx={x(day)} cy={AXIS} r={6} fill="var(--color-ink)" />
          ))}
          <path
            d={`M ${x(last - CADENCE)} ${AXIS - 14} Q ${x(last - CADENCE / 2)} ${AXIS - 34} ${x(last)} ${AXIS - 14}`}
            fill="none"
            stroke="var(--color-muted)"
          />
          <text
            x={x(last - CADENCE / 2)}
            y={AXIS - 38}
            textAnchor="middle"
            fontSize={11}
            fill="var(--color-muted)"
          >
            cadence
          </text>
          <circle
            cx={x(expected)}
            cy={AXIS}
            r={6}
            fill="var(--color-panel)"
            stroke="var(--color-ink)"
            strokeWidth={1.5}
            strokeDasharray="2 2"
          />
          <text
            x={x(expected) + (expected >= 0 ? 10 : -10)}
            y={AXIS - 12}
            textAnchor={expected >= 0 ? "start" : "end"}
            fontSize={11}
            fill="var(--color-ink)"
          >
            E
          </text>
          {f !== null && (
            <g>
              <rect
                x={x(-f * h)}
                y={AXIS + 34}
                width={x(h + f * h) - x(-f * h)}
                height={10}
                rx={3}
                fill="var(--color-surface)"
                stroke="var(--color-muted)"
              />
              <text x={x(-f * h)} y={AXIS + 60} fontSize={11} fill="var(--color-muted)">
                eligible window, f = {f}
              </text>
            </g>
          )}
        </svg>
      </div>
      <ul className="mt-3 grid gap-1 text-sm text-muted">
        <li>
          The shaded window is the {count(h)} days after the cutoff t: a customer who buys nothing
          there is labelled churned.
        </li>
        <li>
          E is the expected next purchase, the last purchase plus the usual gap (the cadence).
        </li>
        {f !== null && (
          <li>
            Only customers whose E falls between t − f·H and t + H + f·H are labelled (f = {f}).
          </li>
        )}
      </ul>
      {f === null && (
        <p className="mt-2 text-sm text-muted">
          The eligibility factor is not in this release (contract 1.2.0 adds it), so the window
          where E must fall is not drawn.
        </p>
      )}
    </figure>
  );
}
