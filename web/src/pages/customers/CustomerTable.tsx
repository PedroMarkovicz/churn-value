/**
 * The ranked list (spec §5.4): a real table, virtualised so only the rows in view are in the DOM,
 * with sortable columns and one button per customer that opens the drawer.
 */
import { useVirtualizer } from "@tanstack/react-virtual";
import { Tooltip } from "radix-ui";
import { useEffect, useEffectEvent, useRef } from "react";

import type { Timeline } from "@/contract/index.ts";
import type { CustomerRow, Decision, ListOptions, SortKey } from "@/domain/customerList.ts";
import { count, money, moneyPrecise, percent } from "@/domain/format.ts";

import { Sparkline } from "./Sparkline.tsx";

const ROW_HEIGHT = 44;

const DECISION: Record<Decision, { text: string; className: string }> = {
  call: { text: "Call", className: "bg-profit-tint text-ink" },
  budget: { text: "Over budget", className: "text-ink shadow-[inset_0_0_0_1px_var(--color-rule)]" },
  skip: { text: "Skip", className: "text-muted" },
};

interface Column {
  key: string;
  label: string;
  name?: string; // the sort button's name when the label is a symbol
  sort: SortKey | null;
  numeric: boolean;
}

function columns(revealed: boolean): Column[] {
  const list: Column[] = [
    { key: "rank", label: "#", name: "Rank", sort: "rank", numeric: true },
    { key: "customer", label: "Customer", sort: null, numeric: false },
    { key: "decision", label: "Decision", sort: null, numeric: false },
    { key: "p", label: "Chance of leaving", sort: "p", numeric: true },
    { key: "value", label: "Value", sort: "value", numeric: true },
    { key: "incentive", label: "Incentive", sort: "incentive", numeric: true },
    { key: "expProfit", label: "Expected profit", sort: "expProfit", numeric: true },
    { key: "history", label: "History", sort: null, numeric: false },
  ];
  if (revealed) list.push({ key: "outcome", label: "What happened", sort: null, numeric: false });
  return list;
}

function ShortHistory({ hint }: { hint: string }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button
          type="button"
          className="rounded-full px-1.5 text-xs text-muted shadow-[inset_0_0_0_1px_var(--color-rule)]"
        >
          2 buys
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content
          sideOffset={6}
          className="z-30 max-w-[260px] rounded-md bg-ink px-2.5 py-2 text-xs leading-relaxed text-panel"
        >
          {hint}
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}

interface Props {
  rows: readonly CustomerRow[];
  options: ListOptions;
  revealed: boolean;
  history: ReadonlyMap<number, Timeline>;
  shortHistoryHint: string;
  selectedId: number | null;
  onSort: (key: SortKey) => void;
  onOpen: (id: number) => void;
}

export function CustomerTable({
  rows,
  options,
  revealed,
  history,
  shortHistoryHint,
  selectedId,
  onSort,
  onOpen,
}: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });
  const items = virtualizer.getVirtualItems();
  const cols = columns(revealed);
  const padTop = items[0]?.start ?? 0;
  const padBottom = virtualizer.getTotalSize() - (items.at(-1)?.end ?? 0);

  // A shared link may point far down the list: bring the open customer into view.
  const bringIntoView = useEffectEvent((id: number) => {
    const at = rows.findIndex((row) => row.id === id);
    if (at >= 0) virtualizer.scrollToIndex(at, { align: "center" });
  });
  useEffect(() => {
    if (selectedId !== null) bringIntoView(selectedId);
  }, [selectedId]);

  const cell = "border-b border-rule px-3";
  return (
    <div
      ref={scrollRef}
      className="relative max-h-[70vh] overflow-auto rounded-[10px] bg-panel shadow-[0_0_0_1px_var(--color-rule)]"
    >
      <table
        aria-rowcount={rows.length + 1}
        className="w-full min-w-[820px] border-collapse text-sm"
      >
        <caption className="sr-only">Customers ranked by the expected profit of a call</caption>
        <thead className="sticky top-0 z-[1] bg-panel">
          <tr aria-rowindex={1}>
            {cols.map((column) => {
              const sort = column.sort;
              const active = sort !== null && options.sort === sort;
              return (
                <th
                  key={column.key}
                  scope="col"
                  aria-sort={active ? (options.descending ? "descending" : "ascending") : undefined}
                  className={`h-10 border-b border-rule px-3 text-xs font-medium text-muted ${column.numeric ? "text-right" : "text-left"}`}
                >
                  {sort === null ? (
                    column.label
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        onSort(sort);
                      }}
                      aria-label={column.name}
                      className={`font-medium ${active ? "text-ink" : ""}`}
                    >
                      {column.label}
                      {active && <span aria-hidden> {options.descending ? "↓" : "↑"}</span>}
                    </button>
                  )}
                </th>
              );
            })}
          </tr>
        </thead>
        <tbody>
          {padTop > 0 && (
            <tr aria-hidden="true">
              <td colSpan={cols.length} style={{ height: padTop, padding: 0 }} />
            </tr>
          )}
          {items.map((item) => {
            const row = rows[item.index];
            if (!row) return null;
            const timeline = history.get(row.id);
            return (
              <tr
                key={row.id}
                aria-rowindex={item.index + 2}
                style={{ height: ROW_HEIGHT }}
                className={row.id === selectedId ? "bg-accent-tint" : undefined}
              >
                <td className={`${cell} text-right text-muted`}>{count(row.rank)}</td>
                <td className={cell}>
                  <span className="inline-flex items-center gap-2">
                    <button
                      type="button"
                      aria-label={`Open customer ${row.id}`}
                      onClick={() => {
                        onOpen(row.id);
                      }}
                      className="font-semibold text-accent underline underline-offset-2"
                    >
                      {row.id}
                    </button>
                    {row.nPurchaseDays <= 2 && <ShortHistory hint={shortHistoryHint} />}
                  </span>
                </td>
                <td className={cell}>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-semibold ${DECISION[row.decision].className}`}
                  >
                    {DECISION[row.decision].text}
                  </span>
                </td>
                <td className={`${cell} text-right`}>{percent(row.p)}</td>
                <td className={`${cell} text-right`}>{money(row.value)}</td>
                <td className={`${cell} text-right`}>{money(row.incentive)}</td>
                <td className={`${cell} text-right`}>{moneyPrecise(row.expProfit)}</td>
                <td className={cell}>
                  {timeline && <Sparkline timeline={timeline} revealed={revealed} />}
                </td>
                {revealed && <td className={cell}>{row.churned ? "Churned" : "Stayed"}</td>}
              </tr>
            );
          })}
          {padBottom > 0 && (
            <tr aria-hidden="true">
              <td colSpan={cols.length} style={{ height: padBottom, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
