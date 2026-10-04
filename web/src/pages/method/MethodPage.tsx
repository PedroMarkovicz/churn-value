/** Method (spec §5.6): how was this built? The label, the validation, the value, the limits. */
import { FixedScenario } from "@/components/layout/FixedScenario.tsx";
import { useAppData } from "@/components/layout/Layout.tsx";
import { PageHeading } from "@/components/layout/PageHeading.tsx";
import { count } from "@/domain/format.ts";
import { validationCalendar, valueBars } from "@/domain/method.ts";

import { Assumptions } from "./Assumptions.tsx";
import { LabelDiagram } from "./LabelDiagram.tsx";
import { type CardResult, ModelCard } from "./ModelCard.tsx";
import { ValidationCalendar } from "./ValidationCalendar.tsx";
import { ValueBacktest } from "./ValueBacktest.tsx";

export const REPOSITORY_URL = "https://github.com/PedroMarkovicz/churn-value";

const LIMITS = [
  "Whether an offer works: there is no campaign history, so acceptance is an assumption.",
  "Anything about one-time buyers: a cadence needs two purchase days.",
  "A second season: the holdout is one autumn, before a Christmas peak.",
  "New customers: the site scores the holdout; it does not take uploads.",
];

const FURTHER = [
  { href: "#model-card", text: "Model card" },
  { href: `${REPOSITORY_URL}/blob/main/docs/design.md`, text: "Design and decisions" },
  { href: `${REPOSITORY_URL}/tree/main/docs/adr`, text: "Architecture decision records" },
  { href: "/notebooks/", text: "The analysis notebooks" },
  { href: REPOSITORY_URL, text: "Source on GitHub" },
];

export function MethodPage({ card }: { card: CardResult }) {
  const { evaluation, manifest, featureSpec } = useAppData();
  const horizon = featureSpec.horizon_days;
  const cutoffs = [
    ...new Set([...evaluation.drift, ...evaluation.stability].map((row) => row.cutoff)),
  ];
  return (
    <>
      <PageHeading
        title="Nobody tells a wholesaler they are leaving. The label has to be built."
        lede={`A customer counts as churned when a buyer who was due to reorder buys nothing in the next ${count(horizon)} days. Everything the model sees is measured before that window opens.`}
      />
      <FixedScenario economics={evaluation.economics} />
      <div className="grid grid-cols-[minmax(0,1fr)] gap-7">
        <LabelDiagram
          horizonDays={horizon}
          eligibilityF={manifest.pipeline?.eligibility_f ?? null}
        />
        <ValidationCalendar
          rows={validationCalendar(evaluation.split, cutoffs, horizon)}
          horizonDays={horizon}
        />
        <ValueBacktest bars={valueBars(evaluation.value_check)} />
        <Assumptions economics={evaluation.economics} />
        <section aria-labelledby="limits-title">
          <h2 id="limits-title" className="font-serif text-2xl">
            What this cannot tell you
          </h2>
          <ul className="mt-3 grid max-w-[72ch] list-disc gap-1.5 pl-5">
            {LIMITS.map((limit) => (
              <li key={limit}>{limit}</li>
            ))}
          </ul>
        </section>
        <ModelCard card={card} />
        <nav aria-labelledby="further-title">
          <h2 id="further-title" className="font-serif text-2xl">
            Read further
          </h2>
          <ul className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
            {FURTHER.map((link) => (
              <li key={link.text}>
                <a href={link.href} className="text-accent underline underline-offset-2">
                  {link.text}
                </a>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </>
  );
}
