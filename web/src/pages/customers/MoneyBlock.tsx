/** The money (spec §5.4, item 4): each amount itemised, then the formula with this customer's numbers. */
import { useId } from "react";

import type { CustomerRow } from "@/domain/customerList.ts";
import { horizonText, moneyFormula, share } from "@/domain/customerText.ts";
import { money, moneyPrecise } from "@/domain/format.ts";
import type { Scenario } from "@/scenario/schema.ts";

export function MoneyBlock({ row, scenario }: { row: CustomerRow; scenario: Scenario }) {
  const titleId = useId();
  const lines: [string, string][] = [
    [`Margin at stake over ${horizonText(scenario.value_horizon_days)}`, money(row.value)],
    [`Offer, ${share(scenario.lambda_c)} of that`, money(row.incentive)],
    ["Cost to replace them", money(row.replacement)],
  ];
  return (
    <section aria-labelledby={titleId}>
      <h3 id={titleId} className="font-serif text-2xl">
        The money
      </h3>
      <dl className="mt-3 grid gap-1.5 text-sm">
        {lines.map(([label, value]) => (
          <div key={label} className="flex justify-between gap-4 border-b border-rule pb-1.5">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-sm text-muted">{moneyFormula(row, scenario)}</p>
      {row.benefit < row.value && (
        <p className="mt-1 text-sm text-muted">
          Replacing them costs less than their margin, so keeping them is worth {money(row.benefit)}
          .
        </p>
      )}
      <p className="mt-3 flex items-baseline justify-between gap-4">
        <span>Expected profit of a call</span>
        <span className="font-serif text-2xl">{moneyPrecise(row.expProfit)}</span>
      </p>
    </section>
  );
}
