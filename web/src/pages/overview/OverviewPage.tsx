/** Overview (spec §5.1): is the model worth money? The field and the account. */
import { Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";

import { useAppData } from "@/components/layout/Layout.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { type Outcome, OUTCOMES, runCampaign } from "@/domain/campaign.ts";
import { count, percent } from "@/domain/format.ts";
import { overviewHeadline } from "@/domain/headlines.ts";
import { useScenario } from "@/scenario/ScenarioProvider.tsx";

import { CampaignAccount } from "./CampaignAccount.tsx";
import { CustomerField, OUTCOME_COLOR, OUTCOME_TEXT } from "./CustomerField.tsx";

const NEXT = [
  {
    to: "/simulator",
    question: "How many should we call?",
    text: "Move the assumptions and watch the list and its profit change.",
  },
  {
    to: "/sensitivity",
    question: "When does it stop paying?",
    text: "The acceptance rate this list needs, and which assumption matters most.",
  },
] as const;

export function OverviewPage() {
  const { table } = useAppData();
  const { scenario } = useScenario();
  const [highlight, setHighlight] = useState<Outcome | null>(null);
  const [asTable, setAsTable] = useState(false);
  const campaign = useMemo(() => runCampaign(table, scenario), [table, scenario]);

  return (
    <>
      <PageHeading
        title={overviewHeadline(table.n, campaign.k, campaign.realizedTotal)}
        lede="Each square is a real wholesale customer on the September 2011 holdout, ranked by what a retention call was expected to earn. Point at a line of the account to see who it came from."
      />
      <div className="grid items-start gap-7 lg:grid-cols-[1.35fr_1fr]">
        <div>
          {asTable ? (
            <table className="w-full border-collapse text-sm">
              <caption className="sr-only">Customers by outcome</caption>
              <thead>
                <tr>
                  {["Outcome", "Customers", "Share"].map((column, i) => (
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
                {OUTCOMES.map((outcome) => (
                  <tr key={outcome}>
                    <td className="border-b border-rule px-2 py-1.5">{OUTCOME_TEXT[outcome]}</td>
                    <td className="border-b border-rule px-2 py-1.5 text-right">
                      {count(campaign.counts[outcome])}
                    </td>
                    <td className="border-b border-rule px-2 py-1.5 text-right">
                      {percent(campaign.counts[outcome] / table.n)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <CustomerField table={table} campaign={campaign} highlight={highlight} />
          )}
          <ul className="mt-3 flex flex-wrap gap-x-5 gap-y-1.5 text-xs text-muted">
            {OUTCOMES.map((outcome) => (
              <li key={outcome} className="inline-flex items-center gap-2">
                <span
                  aria-hidden
                  className="inline-block size-2.5 rounded-[2px]"
                  style={{ background: OUTCOME_COLOR[outcome] }}
                />
                {OUTCOME_TEXT[outcome]} ({count(campaign.counts[outcome])})
              </li>
            ))}
          </ul>
          <button
            type="button"
            aria-pressed={asTable}
            className="mt-2 text-xs font-semibold text-accent"
            onClick={() => {
              setAsTable((v) => !v);
            }}
          >
            {asTable ? "Show the field" : "Show the field as a table"}
          </button>
        </div>
        <CampaignAccount
          campaign={campaign}
          scenario={scenario}
          total={table.n}
          onHighlight={setHighlight}
        />
      </div>
      <nav aria-label="Next questions" className="mt-12 grid gap-4 sm:grid-cols-2">
        {NEXT.map((item) => (
          <Link
            key={item.to}
            to={item.to}
            search={(previous) => previous}
            className="group rounded-lg bg-panel p-5 shadow-[0_0_0_1px_var(--color-rule)] hover:shadow-[0_0_0_1px_var(--color-accent)]"
          >
            <span className="font-serif text-2xl group-hover:text-accent">{item.question}</span>
            <span className="mt-1 block text-sm text-muted">{item.text}</span>
          </Link>
        ))}
      </nav>
    </>
  );
}
