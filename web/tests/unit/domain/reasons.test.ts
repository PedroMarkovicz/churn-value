// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateArtifact } from "@/contract/load.ts";
import { REASONS, reasonText } from "@/domain/reasons.ts";

const CUSTOMER_FEATURES = [
  "recency_days",
  "n_purchase_days",
  "tenure_days",
  "total_spend",
  "avg_order_value",
  "n_distinct_products",
  "return_rate",
  "spend_90d",
  "spend_prev_90d",
  "purchases_90d",
  "cadence_cv",
  "bought_same_window_last_year",
  "is_uk",
  "cadence_days",
  "overdue_ratio",
  "expected_purchases_h",
  "spend_trend",
];

test.each(CUSTOMER_FEATURES)("%s has a plain-language template", (name) => {
  expect(REASONS[name]).toBeTypeOf("function");
});

test("templates read as sentences for any value, never NaN or a feature name", () => {
  for (const template of Object.values(REASONS)) {
    for (const value of [0, 0.004, 0.5, 1, 2, 7.25, 1234.5]) {
      const text = template(value, 90);
      expect(text).not.toMatch(/NaN|undefined|Infinity|_/);
      expect(text).toMatch(/^[A-Z0-9£]/);
    }
  }
});

test("a real customer's top reasons read as facts", () => {
  const reason = (feature: string, value: number) => reasonText({ feature, value, shap: 0.1 }, 90);
  expect(reason("n_purchase_days", 6)).toBe("6 purchase days so far");
  expect(reason("spend_90d", 0)).toBe("No spend in the last 90 days");
  expect(reason("cadence_days", 88.4)).toBe("Reorders about every 88 days");
  expect(reason("expected_purchases_h", 1.0181)).toBe(
    "About 1.0 purchase days expected in the next 90 days at their pace",
  );
  expect(reason("purchases_90d", 0)).toBe("No purchase in the last 90 days");
  expect(reason("n_purchase_days", 2)).toBe("Only 2 purchase days so far");
  expect(reason("is_uk", 0)).toBe("Based outside the United Kingdom");
  expect(reason("overdue_ratio", 1.38)).toBe("1.4 times their usual gap since the last purchase");
});

test("a feature without a template still reads, as its name and value", () => {
  expect(reasonText({ feature: "new_signal", value: 3, shap: 0.2 }, 90)).toBe("new signal: 3");
});

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
test.skipIf(!existsSync(`${DATA}feature_spec.json`))(
  "every customer feature the served model uses has a template",
  () => {
    const spec = validateArtifact(
      "feature_spec",
      JSON.parse(readFileSync(`${DATA}feature_spec.json`, "utf8")),
    );
    const names = spec.features.filter((f) => f.group !== "context").map((f) => f.name);
    expect(names.filter((name) => !(name in REASONS))).toEqual([]);
  },
);
