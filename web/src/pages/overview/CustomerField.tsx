/**
 * The customer field (spec §5.1): every holdout customer as a square, ranked by what a call is
 * expected to earn, coloured by what happened. The one bold element of the app.
 */
import { memo, useEffect, useState } from "react";

import { Tooltip, useWidth } from "@/charts/primitives.tsx";
import type { Campaign, Outcome } from "@/domain/campaign.ts";
import { count, moneyPrecise, percent } from "@/domain/format.ts";
import type { CustomerTable } from "@/domain/table.ts";

export const OUTCOME_COLOR: Record<Outcome, string> = {
  hit: "var(--color-hit)",
  waste: "var(--color-waste)",
  miss: "var(--color-miss)",
  quiet: "var(--color-quiet)",
};

export const OUTCOME_TEXT: Record<Outcome, string> = {
  hit: "called, would have churned",
  waste: "called, would have stayed",
  miss: "churned, not called",
  quiet: "stayed, not called",
};

const GAP = 2;
let played = false; // the entrance plays once per visit, on the first render only

interface Props {
  table: CustomerTable;
  campaign: Campaign;
  highlight: Outcome | null;
  onOpen?: (id: number) => void; // a click opens the customer (Customers page drawer)
}

const Squares = memo(function Squares({
  campaign,
  columns,
  cell,
  highlight,
}: {
  campaign: Campaign;
  columns: number;
  cell: number;
  highlight: Outcome | null;
}) {
  return (
    <>
      {Array.from(campaign.order, (index, rank) => {
        const outcome = campaign.outcomes[index] as Outcome;
        return (
          <rect
            key={rank}
            x={(rank % columns) * (cell + GAP)}
            y={Math.floor(rank / columns) * (cell + GAP)}
            width={cell}
            height={cell}
            rx={1.5}
            fill={OUTCOME_COLOR[outcome]}
            opacity={highlight && highlight !== outcome ? 0.12 : 1}
          />
        );
      })}
    </>
  );
});

export function CustomerField({ table, campaign, highlight, onOpen }: Props) {
  const [ref, width] = useWidth<HTMLDivElement>(720);
  const [animate] = useState(() => !played);
  const [hover, setHover] = useState<{ rank: number; x: number; y: number } | null>(null);
  useEffect(() => {
    played = true;
  }, []);

  const columns = width >= 560 ? 60 : 48; // 48 keeps the field short on a phone
  const cell = Math.max(3, Math.floor((width - (columns - 1) * GAP) / columns));
  const rows = Math.ceil(table.n / columns);
  const svgWidth = columns * (cell + GAP) - GAP;
  const svgHeight = rows * (cell + GAP) - GAP;

  const summary =
    `${count(campaign.k)} of ${count(table.n)} customers called: ${count(campaign.counts.hit)} would have churned, ` +
    `${count(campaign.counts.waste)} would have stayed; ${count(campaign.counts.miss)} ` +
    `${campaign.counts.miss === 1 ? "churner" : "churners"} missed.`;

  const rankAt = (event: { currentTarget: Element; clientX: number; clientY: number }) => {
    const box = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - box.left;
    const y = event.clientY - box.top;
    const column = Math.min(columns - 1, Math.floor(x / (cell + GAP)));
    const rank = Math.floor(y / (cell + GAP)) * columns + column;
    return { rank: rank >= 0 && rank < table.n ? rank : null, x, y };
  };

  const hovered = hover ? campaign.order[hover.rank] : undefined;
  return (
    <div ref={ref} className="relative">
      <svg
        role="img"
        aria-label={summary}
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className={`block max-w-full ${onOpen ? "cursor-pointer" : ""}`}
        onPointerMove={(event) => {
          const { rank, x, y } = rankAt(event);
          setHover(rank === null ? null : { rank, x, y });
        }}
        // A pointer shortcut: the squares are not focusable (spec §8), and keyboard users open
        // a customer from the Customers list.
        onClick={(event) => {
          const { rank } = rankAt(event);
          const index = rank === null ? undefined : campaign.order[rank];
          if (onOpen && index !== undefined) onOpen(table.ids[index] as number);
        }}
        onPointerLeave={() => {
          setHover(null);
        }}
      >
        <Squares campaign={campaign} columns={columns} cell={cell} highlight={highlight} />
      </svg>
      {animate && (
        // The entrance: a surface-coloured mask shrinks downwards, uncovering the squares row by
        // row, which is rank order. One transform animation runs on the compositor; animating
        // 1,920 squares one by one blocked the main thread for over a second.
        <div
          aria-hidden
          className="animate-field-reveal pointer-events-none absolute inset-0 origin-bottom bg-surface"
        />
      )}
      {hover && hovered !== undefined && (
        <Tooltip x={hover.x} y={hover.y} width={svgWidth}>
          <b>Customer {table.ids[hovered]}</b>
          <br />
          Rank {count(hover.rank + 1)} of {count(table.n)}
          <br />
          Chance of leaving {percent(table.p.get(campaign.model)?.[hovered] ?? 0, 1)}
          <br />
          Expected profit of a call {moneyPrecise(campaign.expProfit[hovered] ?? 0)}
          <br />
          {OUTCOME_TEXT[campaign.outcomes[hovered] as Outcome]}
          {onOpen && (
            <>
              <br />
              Click to see why
            </>
          )}
        </Tooltip>
      )}
    </div>
  );
}
