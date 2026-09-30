/**
 * Shared chart pieces (spec §4): a frame with a takeaway title and a table view, a responsive
 * width, a tooltip that stays inside the chart, and label spreading so direct labels never collide.
 */
import { type ReactNode, useEffect, useId, useRef, useState } from "react";

/** Width of the element, following resizes; `fallback` before the first measure and in tests. */
export function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, Math.floor(entry.contentRect.width)));
    });
    observer.observe(element);
    return () => {
      observer.disconnect();
    };
  }, []);
  return [ref, width] as const;
}

/** Label positions near `values` but at least `minGap` apart, order kept, block centred. */
export function spreadPositions(
  values: Record<string, number>,
  minGap: number,
): Record<string, number> {
  const ordered = Object.entries(values).sort((a, b) => a[1] - b[1]);
  const placed: number[] = [];
  for (const [, value] of ordered) {
    const previous = placed.at(-1);
    placed.push(previous === undefined ? value : Math.max(value, previous + minGap));
  }
  const shift =
    placed.length > 0
      ? (ordered.reduce((s, [, v]) => s + v, 0) - placed.reduce((s, v) => s + v, 0)) / placed.length
      : 0;
  return Object.fromEntries(ordered.map(([key], i) => [key, (placed[i] as number) + shift]));
}

export interface ChartFrameProps {
  title: string; // the takeaway, as a sentence
  subtitle: string; // what is plotted
  legend?: ReactNode;
  table: ReactNode; // the same data as a table (spec §4.6)
  note?: ReactNode;
  level?: 2 | 3; // 3 inside the drawer, under its h2
  children: ReactNode;
}

export function ChartFrame({
  title,
  subtitle,
  legend,
  table,
  note,
  level = 2,
  children,
}: ChartFrameProps) {
  const [asTable, setAsTable] = useState(false);
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className="min-w-0 rounded-[10px] bg-panel p-5 shadow-[0_0_0_1px_var(--color-rule)]"
    >
      {level === 3 ? (
        <h3 id={titleId} className="font-serif text-2xl leading-tight">
          {title}
        </h3>
      ) : (
        <h2 id={titleId} className="font-serif text-2xl leading-tight">
          {title}
        </h2>
      )}
      <p className="mt-1 max-w-[72ch] text-sm leading-snug text-muted">{subtitle}</p>
      {legend && <div className="mt-3">{legend}</div>}
      <div className="mt-3">{asTable ? table : children}</div>
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-3 text-xs text-muted">
        <button
          type="button"
          className="font-semibold text-accent"
          aria-pressed={asTable}
          onClick={() => {
            setAsTable((v) => !v);
          }}
        >
          {asTable ? "Show as chart" : "Show as table"}
        </button>
        {note}
      </div>
    </section>
  );
}

/** A dark tooltip positioned inside its (relatively positioned) chart container. */
export function Tooltip({
  x,
  y,
  width,
  children,
}: {
  x: number;
  y: number;
  width: number; // container width, to flip the tooltip left near the right edge
  children: ReactNode;
}) {
  const flip = x > width - 220;
  return (
    <div
      role="status"
      className="pointer-events-none absolute z-10 w-max max-w-[220px] rounded-md bg-ink px-2.5 py-2 text-xs leading-relaxed text-panel shadow-[0_4px_14px_rgba(26,32,64,0.18)]"
      style={{
        left: flip ? undefined : x + 12,
        right: flip ? width - x + 12 : undefined,
        top: Math.max(0, y - 12),
      }}
    >
      {children}
    </div>
  );
}

export function LegendItem({ swatch, children }: { swatch: ReactNode; children: ReactNode }) {
  return (
    <span className="inline-flex items-center gap-2">
      {swatch}
      <span>{children}</span>
    </span>
  );
}

export function LineSwatch({
  dashed = false,
  color = "var(--color-ink)",
}: {
  dashed?: boolean;
  color?: string;
}) {
  return (
    <span
      aria-hidden
      className="inline-block w-5 align-middle"
      style={{ borderTop: `2px ${dashed ? "dashed" : "solid"} ${color}` }}
    />
  );
}

export function BoxSwatch({ color }: { color: string }) {
  return (
    <span
      aria-hidden
      className="inline-block size-2.5 rounded-[2px]"
      style={{ background: color }}
    />
  );
}

/** A plain data table for the "Show as table" view. */
export function DataTable({ columns, rows }: { columns: string[]; rows: (string | number)[][] }) {
  return (
    <div className="max-h-[420px] overflow-auto">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 bg-panel">
          <tr>
            {columns.map((column, i) => (
              <th
                key={column}
                scope="col"
                className={`border-b border-rule px-2 py-1.5 text-xs font-medium text-muted ${i === 0 ? "text-left" : "text-right"}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, r) => (
            <tr key={r}>
              {row.map((cell, i) => (
                <td
                  key={i}
                  className={`border-b border-rule px-2 py-1.5 ${i === 0 ? "text-left" : "text-right"}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
