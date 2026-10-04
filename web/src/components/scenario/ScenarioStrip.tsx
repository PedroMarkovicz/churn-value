/** The scenario travels with you: one chip per assumption, Edit and Reset (spec §3.4). */
import { Dialog, Popover } from "radix-ui";
import { useEffect, useState } from "react";

import { budgetText, chipText } from "@/scenario/copy.ts";
import { useScenario } from "@/scenario/ScenarioProvider.tsx";
import { DEFAULT_SCENARIO, isDefaultScenario, PARAMETER_ORDER } from "@/scenario/schema.ts";

import { Controls } from "./Controls.tsx";

const PHONE = "(max-width: 767px)";

/** True below 768 px (spec §3.4: the editor is a bottom sheet on phones). */
function usePhone(): boolean {
  const [phone, setPhone] = useState(
    () => typeof window.matchMedia === "function" && window.matchMedia(PHONE).matches,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const list = window.matchMedia(PHONE);
    const update = () => {
      setPhone(list.matches);
    };
    list.addEventListener("change", update);
    return () => {
      list.removeEventListener("change", update);
    };
  }, []);
  return phone;
}

function EditorSheet() {
  return (
    <Dialog.Root>
      <Dialog.Trigger className="font-semibold text-accent">Edit scenario</Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-20 bg-ink/25" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-30 max-h-[85vh] overflow-y-auto rounded-t-2xl bg-panel px-5 pt-4 pb-8 shadow-[0_-8px_24px_rgba(26,32,64,0.14)]">
          <div className="mb-3 flex items-center justify-between">
            <Dialog.Title className="font-serif text-2xl">Scenario</Dialog.Title>
            <Dialog.Close className="text-sm font-semibold text-accent">Done</Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">
            Change the assumptions; every number on the page follows.
          </Dialog.Description>
          <Controls />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

export function ScenarioStrip() {
  const { scenario, setScenario, invalid } = useScenario();
  const budget = budgetText(scenario);
  const phone = usePhone();
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
        {phone ? (
          <EditorSheet />
        ) : (
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
        )}
        <button
          type="button"
          className="text-muted disabled:opacity-50"
          disabled={isDefaultScenario(scenario) && invalid.length === 0}
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
