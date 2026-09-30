/**
 * The campaign account (spec §5.1): the list's realized profit, itemised. Pointing at (or
 * focusing) a line lights the customers behind it in the field.
 */
import type { Campaign, Outcome } from "@/domain/campaign.ts";
import { count, money } from "@/domain/format.ts";
import type { Scenario } from "@/scenario/schema.ts";

import { OUTCOME_COLOR } from "./CustomerField.tsx";

interface Props {
  campaign: Campaign;
  scenario: Scenario;
  total: number;
  onHighlight: (outcome: Outcome | null) => void;
}

function Swatch({ outcome }: { outcome: Outcome }) {
  return (
    <span
      aria-hidden
      className="mr-2 inline-block size-2.5 rounded-[2px] align-[-1px]"
      style={{ background: OUTCOME_COLOR[outcome] }}
    />
  );
}

function LinkedRow({
  outcome,
  label,
  value,
  onHighlight,
  quiet = false,
}: {
  outcome: Outcome;
  label: string;
  value: string;
  onHighlight: Props["onHighlight"];
  quiet?: boolean;
}) {
  const on = () => {
    onHighlight(outcome);
  };
  const off = () => {
    onHighlight(null);
  };
  return (
    <li>
      <button
        type="button"
        className={`flex w-full items-baseline justify-between gap-3 border-t border-rule py-2 text-left hover:bg-surface focus-visible:bg-surface ${quiet ? "text-sm text-muted" : "text-sm"}`}
        onMouseEnter={on}
        onMouseLeave={off}
        onFocus={on}
        onBlur={off}
        aria-label={`${label}: ${value}. Highlights these customers in the field.`}
      >
        <span>
          <Swatch outcome={outcome} />
          {label}
        </span>
        <span className={quiet ? "" : "font-semibold"}>{value}</span>
      </button>
    </li>
  );
}

export function CampaignAccount({ campaign, scenario, total, onHighlight }: Props) {
  const { account } = campaign;
  return (
    <section
      aria-label="Campaign account"
      className="rounded-lg bg-panel px-4 py-3 shadow-[0_0_0_1px_var(--color-rule)]"
    >
      <div className="flex justify-between pb-1 text-xs text-muted">
        <span>Campaign account</span>
        <span>on the holdout</span>
      </div>
      <ul>
        <LinkedRow
          outcome="hit"
          label="Churners kept, after their incentive"
          value={money(account.keptNet)}
          onHighlight={onHighlight}
        />
        <LinkedRow
          outcome="waste"
          label="Incentives to customers who'd have stayed"
          value={money(-account.wasted)}
          onHighlight={onHighlight}
        />
        <li className="flex items-baseline justify-between gap-3 border-t border-rule py-2 text-sm">
          <span className="pl-[18px]">Contact costs, {money(scenario.contact_cost)} a call</span>
          <span className="font-semibold">{money(-account.contactCost)}</span>
        </li>
      </ul>
      <div className="flex items-baseline justify-between border-t-2 border-ink pt-3 font-serif text-3xl">
        <span>Net</span>
        <span>{money(account.net)}</span>
      </div>
      <p className="mt-1 mb-3 text-xs text-muted">
        Expected before the outcomes were known: {money(account.expectedNet)}
      </p>
      <ul>
        <LinkedRow
          outcome="miss"
          label="Churners the list missed"
          value={count(account.missed)}
          onHighlight={onHighlight}
          quiet
        />
        <li className="flex items-baseline justify-between gap-3 border-t border-rule py-2 text-sm text-muted">
          <span className="pl-[18px]">Calling all {count(total)} instead</span>
          <span>{money(account.callEveryone)}</span>
        </li>
      </ul>
    </section>
  );
}
