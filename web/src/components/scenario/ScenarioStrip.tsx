/** The scenario travels with you: one chip per assumption, Edit and Reset (spec §3.4). */
import { Popover } from "radix-ui";

import { budgetText, chipText } from "@/scenario/copy.ts";
import { useScenario } from "@/scenario/ScenarioProvider.tsx";
import { DEFAULT_SCENARIO, isDefaultScenario, PARAMETER_ORDER } from "@/scenario/schema.ts";

import { Controls } from "./Controls.tsx";

export function ScenarioStrip() {
  const { scenario, setScenario } = useScenario();
  const budget = budgetText(scenario);
  return (
    <section
      aria-label="Scenario"
      className="flex flex-wrap items-center gap-2 border-t border-rule pt-3 text-xs"
    >
      <span className="text-muted">Scenario</span>
      <ul className="contents">
        {PARAMETER_ORDER.map((name) => (
          <li
            key={name}
            className="rounded-full bg-panel px-2.5 py-1 shadow-[inset_0_0_0_1px_var(--color-rule)]"
          >
            {chipText(name, scenario[name])}
          </li>
        ))}
        {budget && (
          <li className="rounded-full bg-panel px-2.5 py-1 shadow-[inset_0_0_0_1px_var(--color-rule)]">
            {budget}
          </li>
        )}
      </ul>
      <span className="ml-auto flex items-center gap-3">
        <Popover.Root>
          <Popover.Trigger className="font-semibold text-accent">Edit scenario</Popover.Trigger>
          <Popover.Portal>
            <Popover.Content
              align="end"
              sideOffset={8}
              collisionPadding={16}
              className="z-20 max-h-[80vh] w-[min(360px,calc(100vw-32px))] overflow-y-auto rounded-xl bg-panel p-5 shadow-[0_0_0_1px_var(--color-rule),0_12px_32px_rgba(26,32,64,0.14)]"
            >
              <Controls />
            </Popover.Content>
          </Popover.Portal>
        </Popover.Root>
        <button
          type="button"
          className="text-muted disabled:opacity-50"
          disabled={isDefaultScenario(scenario)}
          onClick={() => {
            setScenario(DEFAULT_SCENARIO);
          }}
        >
          Reset
        </button>
      </span>
    </section>
  );
}
