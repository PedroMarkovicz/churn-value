/**
 * What if…? (spec §5.4, item 7): edit what we know about the customer and the model reruns in the
 * browser. Edits are checked for consistency before anything runs. The answer shows before and
 * after with a one-line reading; changed fields say what they were, and Reset puts all back.
 */
import { useId, useMemo, useState } from "react";

import type { Customer, FeatureSpec } from "@/contract/index.ts";
import type { CustomerRow } from "@/domain/customerList.ts";
import { whatIfVerdict } from "@/domain/customerText.ts";
import { moneyPrecise, percent } from "@/domain/format.ts";
import {
  baseValues,
  draftText,
  parseDraft,
  editableFields,
  type Field,
  formatValue,
  modelFeatures,
  type Priced,
  price,
  problems,
  reorderedAgo,
} from "@/domain/whatif.ts";
import type { Scenario } from "@/scenario/schema.ts";
import { type Scorer, useChurnProbability, workerScorer } from "@/workers/inference.ts";

import { AnimatedNumber } from "./AnimatedNumber.tsx";

const DEFAULT_SCORER = workerScorer(); // null where there are no workers (then: unavailable)

type Drafts = Readonly<Record<string, string>>;

function draftsOf(values: Readonly<Record<string, number>>, fields: readonly Field[]): Drafts {
  return Object.fromEntries(
    fields.map((f) => {
      const value = values[f.name];
      return [f.name, value === undefined ? "" : draftText(f, value)];
    }),
  );
}

interface FieldProps {
  field: Field;
  draft: string;
  was: string | null;
  message: string | null;
  onChange: (text: string) => void;
}

function FieldInput({ field, draft, was, message, onChange }: FieldProps) {
  const id = useId();
  const noteId = `${id}-note`;
  const note = message ?? (was === null ? null : `was ${was}`);
  if (field.flag) {
    return (
      <div className="grid gap-1">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft === "1"}
            aria-describedby={note ? noteId : undefined}
            onChange={(event) => {
              onChange(event.target.checked ? "1" : "0");
            }}
            className="size-4 accent-[var(--color-accent)]"
          />
          {field.label}
        </label>
        {note && (
          <p id={noteId} className="text-xs text-muted">
            {note}
          </p>
        )}
      </div>
    );
  }
  return (
    <div className="grid content-start gap-1">
      <label htmlFor={id} className="text-sm">
        {field.label}
      </label>
      <input
        id={id}
        type="text"
        inputMode={field.integer ? "numeric" : "decimal"}
        autoComplete="off"
        value={draft}
        aria-invalid={message ? true : undefined}
        aria-describedby={note ? noteId : undefined}
        onChange={(event) => {
          onChange(event.target.value);
        }}
        className="w-full rounded-md bg-panel px-2.5 py-1.5 text-sm shadow-[inset_0_0_0_1px_var(--color-rule)] aria-[invalid=true]:shadow-[inset_0_0_0_2px_var(--color-loss)]"
      />
      {note && (
        <p id={noteId} className={`text-xs ${message ? "font-semibold text-ink" : "text-muted"}`}>
          {note}
        </p>
      )}
    </div>
  );
}

function Answer({ row, after, budgeted }: { row: CustomerRow; after: Priced; budgeted: boolean }) {
  return (
    <>
      <dl className="grid gap-1.5">
        <div className="flex justify-between gap-4">
          <dt>Chance of leaving</dt>
          <dd>
            {percent(row.p, 1)} <span aria-hidden>→</span>
            <span className="sr-only">becomes</span>{" "}
            <AnimatedNumber value={after.p} format={(v) => percent(v, 1)} />
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt>Expected profit</dt>
          <dd>
            {moneyPrecise(row.expProfit)} <span aria-hidden>→</span>
            <span className="sr-only">becomes</span>{" "}
            <AnimatedNumber value={after.expProfit} format={moneyPrecise} />
          </dd>
        </div>
      </dl>
      <p className="mt-2">{whatIfVerdict(row.expProfit, after.expProfit, budgeted)}</p>
    </>
  );
}

interface Props {
  customer: Customer;
  row: CustomerRow;
  spec: FeatureSpec;
  scenario: Scenario;
  scorer?: Scorer | null;
}

export function WhatIf({ customer, row, spec, scenario, scorer = DEFAULT_SCORER }: Props) {
  const titleId = useId();
  const fields = useMemo(() => editableFields(spec), [spec]);
  const base = useMemo(() => baseValues(customer.features, spec), [customer, spec]);
  const initial = useMemo(() => draftsOf(base, fields), [base, fields]);
  const [drafts, setDrafts] = useState<Drafts>(initial);
  // A field is changed when its text is; untouched fields keep the exact served value, so the
  // rounding in the fields never reaches the model.
  const changed = fields.filter((f) => drafts[f.name] !== initial[f.name]);
  const values = useMemo(
    () => ({
      ...base,
      ...Object.fromEntries(
        Object.entries(drafts)
          .filter(([name, text]) => text !== initial[name])
          .map(([name, text]) => [name, parseDraft(text)]),
      ),
    }),
    [base, drafts, initial],
  );
  const found = useMemo(() => problems(values, fields), [values, fields]);
  const messages = new Map(found.map((p) => [p.field, p.message]));
  const runnable = changed.length > 0 && found.length === 0;
  const features = useMemo(
    () => (runnable ? modelFeatures(values, spec) : null),
    [runnable, values, spec],
  );
  const scored = useChurnProbability(scorer, features);
  const preset = reorderedAgo(base);

  return (
    <section aria-labelledby={titleId} className="grid gap-4">
      <div className="flex items-baseline justify-between gap-4">
        <h3 id={titleId} className="font-serif text-2xl">
          What if…?
        </h3>
        <button
          type="button"
          disabled={changed.length === 0}
          onClick={() => {
            setDrafts(initial);
          }}
          className="text-sm font-semibold text-accent disabled:text-muted"
        >
          Reset
        </button>
      </div>
      <p className="-mt-2 text-sm text-muted">
        Edit what we know about the customer. The model reruns in your browser.
      </p>
      <div>
        <button
          type="button"
          disabled={preset === null}
          onClick={() => {
            if (preset) setDrafts(draftsOf(preset, fields));
          }}
          className="rounded-md px-3 py-1.5 text-sm shadow-[inset_0_0_0_1px_var(--color-rule)] disabled:text-muted"
        >
          Suppose they reordered 30 days ago
        </button>
        {preset === null && (
          <p className="mt-1 text-xs text-muted">They already bought in the last 30 days.</p>
        )}
      </div>
      {(["recent", "history"] as const).map((group) => (
        <fieldset key={group} className="grid gap-3 sm:grid-cols-2">
          <legend className="mb-2 text-sm font-semibold">
            {group === "recent" ? "Recent activity" : "History and profile"}
          </legend>
          {fields
            .filter((field) => field.group === group)
            .map((field) => (
              <FieldInput
                key={field.name}
                field={field}
                draft={drafts[field.name] ?? ""}
                was={
                  changed.includes(field)
                    ? formatValue(field, base[field.name] ?? Number.NaN)
                    : null
                }
                message={messages.get(field.name) ?? null}
                onChange={(text) => {
                  setDrafts((current) => ({ ...current, [field.name]: text }));
                }}
              />
            ))}
        </fieldset>
      ))}
      <div role="status" aria-label="What-if result" className="rounded-lg bg-surface p-4 text-sm">
        {changed.length === 0 ? (
          <p className="text-muted">Change a value to see how the model's answer moves.</p>
        ) : found.length > 0 ? (
          <p>Fix the highlighted values to rerun the model.</p>
        ) : scored.status === "failed" ? (
          <p>
            The model could not run in this browser, so the what-if is unavailable. The rest of this
            page still works.
          </p>
        ) : scored.status === "ready" ? (
          <Answer
            row={row}
            after={price(values, scored.p, spec, scenario)}
            budgeted={scenario.budget_mode !== "none"}
          />
        ) : (
          <p className="text-muted">Running the model in your browser…</p>
        )}
      </div>
    </section>
  );
}
