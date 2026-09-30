import {
  DEFAULT_SCENARIO,
  isDefaultScenario,
  scenarioFromSearch,
  scenarioHash,
  searchFromScenario,
  type Scenario,
} from "@/scenario/schema.ts";

test("the default scenario is a bare URL", () => {
  expect(searchFromScenario(DEFAULT_SCENARIO)).toEqual({});
  expect(isDefaultScenario(DEFAULT_SCENARIO)).toBe(true);
  expect(scenarioFromSearch({})).toEqual({ scenario: DEFAULT_SCENARIO, invalid: [] });
});

test("a changed scenario survives the round trip through the URL", () => {
  const scenario: Scenario = {
    ...DEFAULT_SCENARIO,
    gamma: 0.45,
    lambda_c: 0.25,
    budget_mode: "calls",
    budget_value: 300,
  };
  const search = searchFromScenario(scenario);
  expect(search).toEqual({ g: 0.45, lc: 0.25, bm: "calls", bv: 300 });
  // the router may hand values back as strings
  const asStrings = Object.fromEntries(Object.entries(search).map(([k, v]) => [k, String(v)]));
  expect(scenarioFromSearch(asStrings)).toEqual({ scenario, invalid: [] });
});

test("out-of-range and malformed values fall back to defaults and are reported", () => {
  const { scenario, invalid } = scenarioFromSearch({ g: "1.5", m: "abc", c: "", t: 400 });
  expect(scenario.gamma).toBe(DEFAULT_SCENARIO.gamma);
  expect(scenario.margin).toBe(DEFAULT_SCENARIO.margin);
  expect(scenario.contact_cost).toBe(DEFAULT_SCENARIO.contact_cost);
  expect(scenario.value_horizon_days).toBe(400);
  expect(invalid).toEqual(["g", "m", "c"]);
});

test("a budget needs a valid mode and a value in range", () => {
  expect(scenarioFromSearch({ bm: "weekly" }).invalid).toEqual(["bm"]);
  const bad = scenarioFromSearch({ bm: "spend", bv: "5" });
  expect(bad.invalid).toEqual(["bv"]);
  expect(bad.scenario.budget_mode).toBe("spend");
  expect(bad.scenario.budget_value).toBe(10_000); // the spend default
  expect(scenarioFromSearch({ bm: "calls", bv: "12.7" }).scenario.budget_value).toBe(13);
});

test("the scenario hash changes with any assumption", () => {
  const other = { ...DEFAULT_SCENARIO, lambda_a: 12 };
  expect(scenarioHash(other)).not.toBe(scenarioHash(DEFAULT_SCENARIO));
  expect(scenarioHash(DEFAULT_SCENARIO)).toBe("g0.3-lc0.1-la10-m0.35-c1-t365");
});
