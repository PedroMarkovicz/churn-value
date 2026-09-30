/**
 * The validation calendar (spec §5.6): every monthly cutoff on one time axis. Training cutoffs,
 * the calibration month and the test month, each with the window in which its outcome became
 * known; the gaps keep every outcome closed before the next stage starts.
 */
import { scaleTime } from "@visx/scale";

import { ChartFrame, DataTable, LegendItem, useWidth } from "@/charts/primitives.tsx";
import { type CalendarRow, calendarTitle, type Stage } from "@/domain/method.ts";

const HEIGHT = 150;
const LANE: Record<Stage, number> = { train: 40, gap: 40, calibration: 80, test: 110 };
const WORD: Record<Stage, string> = {
  train: "train",
  gap: "gap",
  calibration: "calibration",
  test: "test",
};
const MONTH = new Intl.DateTimeFormat("en-GB", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});
const date = (iso: string) => new Date(`${iso}T00:00:00Z`);

function Mark({ stage }: { stage: Stage }) {
  return (
    <svg aria-hidden width={12} height={12} className="inline-block">
      <circle
        cx={6}
        cy={6}
        r={4.5}
        fill={stage === "gap" ? "var(--color-panel)" : "var(--color-ink)"}
        stroke="var(--color-ink)"
        strokeWidth={1.5}
      />
    </svg>
  );
}

export function ValidationCalendar({
  rows,
  horizonDays,
}: {
  rows: CalendarRow[];
  horizonDays: number;
}) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const first = rows[0]?.cutoff ?? "2010-01-01";
  const last = rows.at(-1)?.outcomeEnd ?? first;
  const x = scaleTime<number>({ domain: [date(first), date(last)], range: [16, width - 16] });
  const trained = rows.filter((r) => r.stage === "train");
  const firstTrain = trained[0];
  const lastTrain = trained.at(-1);

  return (
    <ChartFrame
      title={calendarTitle(rows)}
      subtitle={`Monthly cutoffs. Each stage only uses outcomes already known when it starts: a cutoff's outcome is known ${horizonDays} days later (the bars).`}
      legend={
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
          <LegendItem swatch={<Mark stage="train" />}>used by a stage</LegendItem>
          <LegendItem swatch={<Mark stage="gap" />}>skipped, so outcomes never overlap</LegendItem>
        </p>
      }
      table={
        <DataTable
          columns={["Cutoff", "Stage", "Outcome known"]}
          rows={rows.map((r) => [
            MONTH.format(date(r.cutoff)),
            WORD[r.stage],
            MONTH.format(date(r.outcomeEnd)),
          ])}
        />
      }
    >
      <div ref={ref}>
        <svg
          width={width}
          height={HEIGHT}
          role="img"
          aria-label={calendarTitle(rows)}
          className="block max-w-full"
        >
          {firstTrain && lastTrain && (
            <text x={x(date(firstTrain.cutoff))} y={24} fontSize={11} fill="var(--color-ink)">
              training: {trained.length} cutoffs
            </text>
          )}
          {rows.map((r) => {
            const y = LANE[r.stage];
            const cx = x(date(r.cutoff));
            return (
              <g key={r.cutoff}>
                {(r.stage === "calibration" || r.stage === "test") && (
                  <>
                    <rect
                      x={cx}
                      y={y - 4}
                      width={Math.max(2, x(date(r.outcomeEnd)) - cx)}
                      height={8}
                      rx={3}
                      fill="var(--color-rule)"
                    />
                    <text x={cx} y={y - 10} fontSize={11} fill="var(--color-ink)">
                      {WORD[r.stage]}, {MONTH.format(date(r.cutoff))}
                    </text>
                  </>
                )}
                <circle
                  cx={cx}
                  cy={y}
                  r={4.5}
                  fill={r.stage === "gap" ? "var(--color-panel)" : "var(--color-ink)"}
                  stroke="var(--color-ink)"
                  strokeWidth={1.5}
                />
              </g>
            );
          })}
          <text x={16} y={HEIGHT - 6} fontSize={11} fill="var(--color-muted)">
            {MONTH.format(date(first))}
          </text>
          <text
            x={width - 16}
            y={HEIGHT - 6}
            textAnchor="end"
            fontSize={11}
            fill="var(--color-muted)"
          >
            {MONTH.format(date(last))}
          </text>
        </svg>
      </div>
    </ChartFrame>
  );
}
