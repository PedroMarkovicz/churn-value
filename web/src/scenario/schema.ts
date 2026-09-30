/**
 * The scenario: the business assumptions of design §4.4, carried in the URL so any scenario is a
 * link. Only values that differ from the defaults are written, under short keys.
 */
import type { EconomicParams } from "@/contract/index.ts";

export type Parameter = keyof EconomicParams;
export type BudgetMode = "none" | "spend" | "calls";

export interface Scenario extends EconomicParams {
  budget_mode: BudgetMode;
  budget_value: number; // £ of expected spend, or number of calls; ignored when mode is none
}

export interface ParameterSpec {
  key: string; // URL key
  label: string; // as the controls name it
  min: number;
  max: number;
  step: number;
  default: number;
}

/** Ranges and defaults from design §4.4 (defaults match ml/configs/default.yaml). */
export const PARAMETERS: Record<Parameter, ParameterSpec> = {
  gamma: { key: "g", label: "Acceptance", min: 0, max: 1, step: 0.01, default: 0.3 },
  lambda_c: { key: "lc", label: "Incentive", min: 0, max: 0.5, step: 0.005, default: 0.1 },
  lambda_a: { key: "la", label: "Replacement cost", min: 1, max: 25, step: 0.5, default: 10 },
  margin: { key: "m", label: "Gross margin", min: 0.05, max: 0.8, step: 0.01, default: 0.35 },
  contact_cost: { key: "c", label: "Cost of a call", min: 0, max: 20, step: 0.5, default: 1 },
  value_horizon_days: {
    key: "t",
    label: "Value horizon",
    min: 90,
    max: 730,
    step: 5,
    default: 365,
  },
};
export const PARAMETER_ORDER: Parameter[] = [
  "gamma",
  "lambda_c",
  "lambda_a",
  "margin",
  "contact_cost",
  "value_horizon_days",
];

export const BUDGET_LIMITS: Record<Exclude<BudgetMode, "none">, ParameterSpec> = {
  spend: { key: "bv", label: "Budget", min: 100, max: 100_000, step: 100, default: 10_000 },
  calls: { key: "bv", label: "Calls", min: 1, max: 1920, step: 1, default: 500 },
};

export const DEFAULT_SCENARIO: Scenario = {
  gamma: 0.3,
  lambda_c: 0.1,
  lambda_a: 10,
  margin: 0.35,
  contact_cost: 1,
  value_horizon_days: 365,
  budget_mode: "none",
  budget_value: 0,
};

export interface ParsedScenario {
  scenario: Scenario;
  invalid: string[]; // URL keys whose values were ignored
}

function readNumber(raw: unknown): number | null {
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : null;
  if (typeof raw === "string" && raw.trim() !== "") {
    const value = Number(raw);
    return Number.isFinite(value) ? value : null;
  }
  return null;
}

/** The scenario in `search`; out-of-range or malformed values fall back to their defaults. */
export function scenarioFromSearch(search: Record<string, unknown>): ParsedScenario {
  const scenario: Scenario = { ...DEFAULT_SCENARIO };
  const invalid: string[] = [];
  for (const name of PARAMETER_ORDER) {
    const spec = PARAMETERS[name];
    if (!(spec.key in search)) continue;
    const value = readNumber(search[spec.key]);
    if (value === null || value < spec.min || value > spec.max) invalid.push(spec.key);
    else scenario[name] = value;
  }
  const mode = search.bm;
  if (mode === "spend" || mode === "calls") {
    const limits = BUDGET_LIMITS[mode];
    const value = readNumber(search.bv);
    if (value === null || value < limits.min || value > limits.max) {
      invalid.push("bv");
      scenario.budget_mode = mode;
      scenario.budget_value = limits.default;
    } else {
      scenario.budget_mode = mode;
      scenario.budget_value = mode === "calls" ? Math.round(value) : value;
    }
  } else if (mode !== undefined && mode !== "none") {
    invalid.push("bm");
  }
  return { scenario, invalid };
}

/** URL search params for `scenario`: defaults are omitted, so the default scenario is a bare URL. */
export function searchFromScenario(scenario: Scenario): Record<string, string | number> {
  const search: Record<string, string | number> = {};
  for (const name of PARAMETER_ORDER) {
    const spec = PARAMETERS[name];
    if (scenario[name] !== spec.default) search[spec.key] = scenario[name];
  }
  if (scenario.budget_mode !== "none") {
    search.bm = scenario.budget_mode;
    search.bv = scenario.budget_value;
  }
  return search;
}

export function isDefaultScenario(scenario: Scenario): boolean {
  return Object.keys(searchFromScenario(scenario)).length === 0;
}

/** A short stable id for file names and caches, e.g. "g0.3-lc0.1-…". */
export function scenarioHash(scenario: Scenario): string {
  const parts = PARAMETER_ORDER.map((name) => `${PARAMETERS[name].key}${scenario[name]}`);
  if (scenario.budget_mode !== "none")
    parts.push(`${scenario.budget_mode}${scenario.budget_value}`);
  return parts.join("-");
}
