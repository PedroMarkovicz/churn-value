/** The assumption controls, grouped as the business thinks of them (spec §5.2). */
import { Slider, ToggleGroup } from "radix-ui";
import { useId, useState } from "react";

import { count, money } from "@/domain/format.ts";
import { formatParameter, HINTS, replacementRegime } from "@/scenario/copy.ts";
import { useScenario } from "@/scenario/ScenarioProvider.tsx";
import {
  BUDGET_LIMITS,
  type BudgetMode,
  type Parameter,
  type ParameterSpec,
  PARAMETERS,
  type Scenario,
} from "@/scenario/schema.ts";

const GROUPS: { title: string; parameters: Parameter[] }[] = [
  { title: "The offer", parameters: ["gamma", "lambda_c"] },
  { title: "The customer", parameters: ["margin", "value_horizon_days", "lambda_a"] },
  { title: "The campaign", parameters: ["contact_cost"] },
];

function ParameterSlider({ name }: { name: Parameter }) {
  const { scenario, setScenario } = useScenario();
  const spec = PARAMETERS[name];
  const hintId = useId();
  const value = scenario[name];
  const hint = name === "lambda_a" ? replacementRegime(scenario) : HINTS[name];
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        <span className="font-semibold">{spec.label}</span>
        <output className="text-ink">{formatParameter(name, value)}</output>
      </div>
      <Slider.Root
        className="relative flex h-5 w-full touch-none items-center select-none"
        min={spec.min}
        max={spec.max}
        step={spec.step}
        value={[value]}
        onValueChange={([next]) => {
          if (next !== undefined) setScenario({ ...scenario, [name]: next });
        }}
      >
        <Slider.Track className="relative h-[3px] grow rounded-full bg-rule">
          <Slider.Range className="absolute h-full rounded-full bg-accent" />
        </Slider.Track>
        <Slider.Thumb
          aria-label={spec.label}
          aria-describedby={hintId}
          aria-valuetext={formatParameter(name, value)}
          className="block size-4 rounded-full bg-panel shadow-[0_0_0_2px_var(--color-accent)]"
        />
      </Slider.Root>
      <p id={hintId} className="text-xs leading-snug text-muted">
        {hint}
      </p>
    </div>
  );
}

/**
 * The budget amount. What is typed stays as typed: only a value in range reaches the scenario,
 * and anything else is settled (clamped, and rounded to whole calls) when the field is left.
 */
function BudgetInput({ id, limits }: { id: string; limits: ParameterSpec }) {
  const { scenario, setScenario } = useScenario();
  const [draft, setDraft] = useState<string | null>(null); // null: show the scenario's value
  const calls = scenario.budget_mode === "calls";
  const text = draft ?? String(scenario.budget_value);
  const value = Number(text);
  const valid =
    text.trim() !== "" && Number.isFinite(value) && value >= limits.min && value <= limits.max;
  const settle = (v: number) => (calls ? Math.round(v) : v);
  const hint = calls
    ? `Between ${count(limits.min)} and ${count(limits.max)} calls.`
    : `Between ${money(limits.min)} and ${money(limits.max)}.`;
  const commit = () => {
    if (!valid && text.trim() !== "" && Number.isFinite(value)) {
      setScenario({
        ...scenario,
        budget_value: settle(Math.min(limits.max, Math.max(limits.min, value))),
      });
    }
    setDraft(null);
  };
  return (
    <label htmlFor={id} className="grid gap-1 text-xs text-muted">
      {calls ? "Number of calls" : "Expected spend, £"}
      <input
        id={id}
        type="number"
        inputMode="numeric"
        min={limits.min}
        max={limits.max}
        step={limits.step}
        value={text}
        aria-invalid={!valid}
        aria-describedby={valid ? undefined : `${id}-hint`}
        onChange={(event) => {
          const next = event.target.value;
          setDraft(next);
          const v = Number(next);
          if (next.trim() !== "" && Number.isFinite(v) && v >= limits.min && v <= limits.max) {
            setScenario({ ...scenario, budget_value: settle(v) });
          }
        }}
        onBlur={commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }}
        className="w-32 rounded-md bg-panel px-2 py-1 text-sm text-ink shadow-[inset_0_0_0_1px_var(--color-rule)] aria-invalid:shadow-[inset_0_0_0_1.5px_var(--color-accent)]"
      />
      {!valid && (
        <span id={`${id}-hint`} className="text-ink">
          {hint}
        </span>
      )}
    </label>
  );
}

const MODES: { mode: BudgetMode; label: string }[] = [
  { mode: "none", label: "None" },
  { mode: "spend", label: "£ spend" },
  { mode: "calls", label: "Calls" },
];

function BudgetControl() {
  const { scenario, setScenario } = useScenario();
  const inputId = useId();
  const setMode = (mode: BudgetMode) => {
    const next: Scenario = { ...scenario, budget_mode: mode };
    next.budget_value = mode === "none" ? 0 : BUDGET_LIMITS[mode].default;
    setScenario(next);
  };
  const limits = scenario.budget_mode === "none" ? null : BUDGET_LIMITS[scenario.budget_mode];
  return (
    <div className="grid gap-2">
      <span className="text-sm font-semibold" id={`${inputId}-label`}>
        Budget
      </span>
      <ToggleGroup.Root
        type="single"
        aria-labelledby={`${inputId}-label`}
        value={scenario.budget_mode}
        onValueChange={(mode) => {
          if (mode) setMode(mode as BudgetMode);
        }}
        className="flex gap-1.5"
      >
        {MODES.map(({ mode, label }) => (
          <ToggleGroup.Item
            key={mode}
            value={mode}
            className="rounded-md px-2.5 py-1 text-sm shadow-[inset_0_0_0_1px_var(--color-rule)] data-[state=on]:bg-ink data-[state=on]:text-panel data-[state=on]:shadow-none"
          >
            {label}
          </ToggleGroup.Item>
        ))}
      </ToggleGroup.Root>
      {limits && <BudgetInput key={scenario.budget_mode} id={inputId} limits={limits} />}
      <p className="text-xs leading-snug text-muted">
        Cap the campaign by expected spend or by the number of calls.
      </p>
    </div>
  );
}

export function Controls() {
  return (
    <div className="grid gap-6">
      {GROUPS.map((group) => (
        <fieldset key={group.title} className="grid gap-4">
          <legend className="mb-3 font-serif text-lg">{group.title}</legend>
          {group.parameters.map((name) => (
            <ParameterSlider key={name} name={name} />
          ))}
          {group.title === "The campaign" && <BudgetControl />}
        </fieldset>
      ))}
    </div>
  );
}
