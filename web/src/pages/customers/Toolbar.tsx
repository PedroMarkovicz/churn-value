/** The list's controls (spec §5.4): search by id, decision and country, the reveal, the CSV. */
import { ToggleGroup } from "radix-ui";
import { useId } from "react";

import type { CountryFilter, DecisionFilter, ListOptions } from "@/domain/customerList.ts";
import { count } from "@/domain/format.ts";

const CHOICE =
  "rounded-md px-2.5 py-1 text-sm shadow-[inset_0_0_0_1px_var(--color-rule)] data-[state=on]:bg-ink data-[state=on]:text-panel data-[state=on]:shadow-none";

interface Props {
  options: ListOptions;
  counts: { call: number; skip: number; all: number };
  revealed: boolean;
  onChange: (next: ListOptions) => void;
  onReveal: (next: boolean) => void;
  onDownload: () => void;
}

export function Toolbar({ options, counts, revealed, onChange, onReveal, onDownload }: Props) {
  const searchId = useId();
  return (
    <div className="mb-3 flex flex-wrap items-center gap-x-5 gap-y-3">
      <div className="flex items-center gap-2">
        <label htmlFor={searchId} className="text-sm text-muted">
          Find a customer
        </label>
        <input
          id={searchId}
          type="search"
          inputMode="numeric"
          autoComplete="off"
          value={options.query}
          onChange={(event) => {
            onChange({ ...options, query: event.target.value });
          }}
          className="w-32 rounded-md bg-panel px-2.5 py-1 text-sm shadow-[inset_0_0_0_1px_var(--color-rule)]"
        />
      </div>
      <ToggleGroup.Root
        type="single"
        aria-label="Decision"
        value={options.decision}
        onValueChange={(value) => {
          if (value) onChange({ ...options, decision: value as DecisionFilter });
        }}
        className="flex gap-1.5"
      >
        <ToggleGroup.Item value="call" className={CHOICE}>
          Call ({count(counts.call)})
        </ToggleGroup.Item>
        <ToggleGroup.Item value="skip" className={CHOICE}>
          Skip ({count(counts.skip)})
        </ToggleGroup.Item>
        <ToggleGroup.Item value="all" className={CHOICE}>
          All
        </ToggleGroup.Item>
      </ToggleGroup.Root>
      <ToggleGroup.Root
        type="single"
        aria-label="Country"
        value={options.country}
        onValueChange={(value) => {
          if (value) onChange({ ...options, country: value as CountryFilter });
        }}
        className="flex gap-1.5"
      >
        <ToggleGroup.Item value="all" className={CHOICE}>
          All countries
        </ToggleGroup.Item>
        <ToggleGroup.Item value="uk" className={CHOICE}>
          UK
        </ToggleGroup.Item>
        <ToggleGroup.Item value="outside" className={CHOICE}>
          Outside the UK
        </ToggleGroup.Item>
      </ToggleGroup.Root>
      <button
        type="button"
        aria-pressed={revealed}
        onClick={() => {
          onReveal(!revealed);
        }}
        className="rounded-md px-2.5 py-1 text-sm shadow-[inset_0_0_0_1px_var(--color-rule)] aria-pressed:bg-ink aria-pressed:text-panel aria-pressed:shadow-none"
      >
        Show what happened
      </button>
      <button
        type="button"
        onClick={onDownload}
        className="rounded-md bg-ink px-3 py-1 text-sm font-semibold text-panel sm:ml-auto"
      >
        Download CSV
      </button>
    </div>
  );
}
