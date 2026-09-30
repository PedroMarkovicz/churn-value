/** Customers (spec §5.4): who exactly, and why? The ranked list, its filters and its export. */
import { Tooltip } from "radix-ui";
import { useMemo, useState } from "react";

import { useAppData } from "@/components/layout/Layout.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import type { TimelinesFile } from "@/contract/index.ts";
import { halfValueCount, runCampaign } from "@/domain/campaign.ts";
import { csvFileName, customersCsv } from "@/domain/csv.ts";
import {
  customerRows,
  decisionCounts,
  DEFAULT_LIST,
  type ListOptions,
  listView,
  nextSort,
} from "@/domain/customerList.ts";
import { monthName, shortHistoryHint, shortHistoryNote } from "@/domain/customerText.ts";
import { count } from "@/domain/format.ts";
import { customersHeadline } from "@/domain/headlines.ts";
import { indexTimelines } from "@/domain/history.ts";
import { useScenario } from "@/scenario/ScenarioProvider.tsx";

import { CustomerDrawer } from "./CustomerDrawer.tsx";
import { CustomerTable } from "./CustomerTable.tsx";
import { downloadText } from "./download.ts";
import { Toolbar } from "./Toolbar.tsx";
import { useCustomerParam } from "./useCustomerParam.ts";

const LEDE =
  "Ranked by what a call is expected to earn under the current scenario. Open a customer to see the reasons, their history and what would change the decision.";

function EmptyView({ options, onShowAll }: { options: ListOptions; onShowAll: () => void }) {
  const query = options.query.trim();
  const text = query
    ? `No customer in this view matches “${query}”.`
    : options.decision === "call" && options.country === "all"
      ? "No customer is worth a call under these assumptions."
      : "No customer in this view.";
  return (
    <div className="rounded-[10px] bg-panel p-6 shadow-[0_0_0_1px_var(--color-rule)]">
      <p>{text}</p>
      <button type="button" onClick={onShowAll} className="mt-2 text-sm font-semibold text-accent">
        Show all customers
      </button>
    </div>
  );
}

export function CustomersPage({ timelines }: { timelines: TimelinesFile }) {
  const { table, evaluation, customers, featureSpec } = useAppData();
  const { scenario } = useScenario();
  const campaign = useMemo(() => runCampaign(table, scenario), [table, scenario]);
  const rows = useMemo(() => customerRows(table, campaign, scenario), [table, campaign, scenario]);
  const history = useMemo(() => indexTimelines(timelines), [timelines]);
  const [options, setOptions] = useState(DEFAULT_LIST);
  const [revealed, setRevealed] = useState(false);
  const view = useMemo(() => listView(rows, options), [rows, options]);
  const customer = useCustomerParam(table.indexById);
  const note = shortHistoryNote(rows);
  const openRow =
    customer.index === undefined ? undefined : rows.find((row) => row.index === customer.index);
  const openCustomer =
    customer.index === undefined ? undefined : customers.customers[customer.index];
  const holdout = `${monthName(customers.cutoff)} ${customers.cutoff.slice(0, 4)}`;

  return (
    <>
      <PageHeading
        title={customersHeadline(campaign.k, campaign.expected, halfValueCount(campaign))}
        lede={note ? `${LEDE} ${note}` : LEDE}
      />
      {customer.unknown !== null && (
        <div
          role="status"
          className="mb-4 flex items-start justify-between gap-4 rounded-lg bg-accent-tint px-4 py-3 text-sm"
        >
          <p>
            Customer {customer.unknown.slice(0, 24)} is not among the holdout customers of {holdout}
            .
          </p>
          <button type="button" className="font-semibold text-accent" onClick={customer.close}>
            Dismiss
          </button>
        </div>
      )}
      <Toolbar
        options={options}
        counts={decisionCounts(rows)}
        revealed={revealed}
        onChange={setOptions}
        onReveal={setRevealed}
        onDownload={() => {
          downloadText(customersCsv(view, revealed), csvFileName(scenario));
        }}
      />
      <Tooltip.Provider delayDuration={200}>
        {view.length > 0 ? (
          <CustomerTable
            rows={view}
            options={options}
            revealed={revealed}
            history={history}
            shortHistoryHint={shortHistoryHint(evaluation.value_check)}
            selectedId={customer.id}
            onSort={(key) => {
              setOptions((current) => nextSort(current, key));
            }}
            onOpen={customer.open}
          />
        ) : (
          <EmptyView
            options={options}
            onShowAll={() => {
              setOptions((current) => ({ ...current, decision: "all", country: "all" }));
            }}
          />
        )}
      </Tooltip.Provider>
      <p className="mt-2 text-xs text-muted">
        {count(view.length)} {view.length === 1 ? "customer" : "customers"} in this view.
      </p>
      {openRow && openCustomer && (
        <CustomerDrawer
          row={openRow}
          customer={openCustomer}
          timeline={history.get(openRow.id)}
          scenario={scenario}
          featureSpec={featureSpec}
          total={table.n}
          cutoff={customers.cutoff}
          horizonDays={customers.horizon_days}
          revealed={revealed}
          onClose={customer.close}
        />
      )}
    </>
  );
}
