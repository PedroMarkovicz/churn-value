/**
 * The live scenario. The URL is the source of truth (links, back and forward), but a slider drag
 * would rewrite it dozens of times a second, which browsers throttle (Safari throws after 100
 * replaceState calls in 30 s). So edits apply at once in memory and reach the URL after a pause.
 */
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  BUDGET_LIMITS,
  PARAMETER_ORDER,
  PARAMETERS,
  type Scenario,
  scenarioFromSearch,
  scenarioHash,
  searchFromScenario,
} from "./schema.ts";

export const URL_DELAY_MS = 250;

const SCENARIO_KEYS = new Set([
  ...PARAMETER_ORDER.map((name) => PARAMETERS[name].key),
  "bm",
  BUDGET_LIMITS.spend.key,
]);

interface ScenarioState {
  scenario: Scenario;
  invalid: string[]; // URL keys that were ignored
  setScenario: (next: Scenario) => void;
}

const ScenarioContext = createContext<ScenarioState | null>(null);

export function ScenarioProvider({ children }: { children: ReactNode }) {
  const search: Record<string, unknown> = useSearch({ strict: false });
  const navigate = useNavigate();
  const fromUrl = useMemo(() => scenarioFromSearch(search), [search]);
  const [draft, setDraft] = useState<Scenario | null>(null);
  const timer = useRef<number | undefined>(undefined);

  // The URL changed on its own (back, forward, a link): it wins over any pending edit.
  const urlHash = scenarioHash(fromUrl.scenario);
  const written = useRef(urlHash);
  useEffect(() => {
    if (urlHash !== written.current) {
      window.clearTimeout(timer.current);
      setDraft(null);
    }
    written.current = urlHash;
  }, [urlHash]);

  useEffect(
    () => () => {
      window.clearTimeout(timer.current);
    },
    [],
  );

  const setScenario = useCallback(
    (next: Scenario) => {
      setDraft(next);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        written.current = scenarioHash(next);
        void navigate({
          to: ".",
          replace: true,
          resetScroll: false,
          search: (previous: Record<string, unknown>) => ({
            ...Object.fromEntries(
              Object.entries(previous).filter(([key]) => !SCENARIO_KEYS.has(key)),
            ),
            ...searchFromScenario(next),
          }),
        });
      }, URL_DELAY_MS);
    },
    [navigate],
  );

  const value = useMemo(
    () => ({ scenario: draft ?? fromUrl.scenario, invalid: fromUrl.invalid, setScenario }),
    [draft, fromUrl, setScenario],
  );
  return <ScenarioContext value={value}>{children}</ScenarioContext>;
}

export function useScenario(): ScenarioState {
  const state = useContext(ScenarioContext);
  if (!state) throw new Error("useScenario needs a ScenarioProvider");
  return state;
}
