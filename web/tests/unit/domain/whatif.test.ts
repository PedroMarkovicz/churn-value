// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import type { CalibratorFile } from "@/contract/index.ts";
import { validateArtifact } from "@/contract/load.ts";
import { calibrate } from "@/domain/calibrator.ts";
import { runCampaign } from "@/domain/campaign.ts";
import { customerRows } from "@/domain/customerList.ts";
import { expectedAov } from "@/domain/gammaGamma.ts";
import { buildTable } from "@/domain/table.ts";
import {
  baseValues,
  draftText,
  editableFields,
  formatValue,
  modelFeatures,
  price,
  problems,
  reorderedAgo,
} from "@/domain/whatif.ts";
import { DEFAULT_SCENARIO } from "@/scenario/schema.ts";
import { sha256Hex } from "@/workers/integrity.ts";

import { featureSpecFixture, fixtureFeatures } from "../fixtures/artifacts.ts";
import { close } from "../golden.ts";

const spec = featureSpecFixture();
const fields = editableFields(spec);
const base = baseValues(fixtureFeatures(100, 30), spec); // recency 20, 5 days, tenure 140, £500

test("the fields are the editable base features, recent activity first", () => {
  expect(fields.map((f) => f.name)).toEqual([
    "recency_days",
    "purchases_90d",
    "spend_90d",
    "spend_prev_90d",
    "n_purchase_days",
    "tenure_days",
    "total_spend",
    "n_distinct_products",
    "cadence_cv",
    "return_rate",
    "bought_same_window_last_year",
    "is_uk",
  ]);
  expect(fields.filter((f) => f.flag).map((f) => f.name)).toEqual([
    "bought_same_window_last_year",
    "is_uk",
  ]);
  expect(fields[0]).toMatchObject({
    label: "Days since last purchase",
    group: "recent",
    integer: true,
    min: 0,
    max: 344,
  });
});

test("the fields start from readable text, not floating-point noise", () => {
  const field = (name: string) => {
    const found = fields.find((f) => f.name === name);
    if (!found) throw new Error(`no field ${name}`);
    return found;
  };
  expect(draftText(field("spend_prev_90d"), 348.15000000000003)).toBe("348.15");
  expect(draftText(field("cadence_cv"), 0.8944738308078793)).toBe("0.894");
  expect(draftText(field("recency_days"), 122)).toBe("122");
});

test("values are written the way the field reads", () => {
  const field = (name: string) => {
    const found = fields.find((f) => f.name === name);
    if (!found) throw new Error(`no field ${name}`);
    return found;
  };
  expect(formatValue(field("spend_90d"), 348.15)).toBe("£348");
  expect(formatValue(field("recency_days"), 122)).toBe("122");
  expect(formatValue(field("is_uk"), 1)).toBe("yes");
  expect(formatValue(field("cadence_cv"), 0.8944)).toBe("0.89");
});

test("a consistent customer has no problems", () => {
  expect(problems(base, fields)).toEqual([]);
});

test.each([
  [{ recency_days: Number.NaN }, "recency_days", "Enter a number."],
  [{ n_purchase_days: 5.5 }, "n_purchase_days", "Enter a whole number."],
  [{ recency_days: 400 }, "recency_days", "Between 0 and 344."],
  [{ spend_90d: -5 }, "spend_90d", "Between £0 and £105,867.81."],
  [{ recency_days: 150 }, "tenure_days", "At least the days since last purchase (150)."],
  [{ purchases_90d: 6 }, "purchases_90d", "At most the purchase days in total (5)."],
  [
    { purchases_90d: 0, spend_90d: 0 },
    "purchases_90d",
    "At least 1: the last purchase was within 90 days.",
  ],
  [
    { recency_days: 100, tenure_days: 200 },
    "purchases_90d",
    "0: the last purchase was more than 90 days ago.",
  ],
  [{ spend_90d: 0 }, "spend_90d", "More than £0: they bought in the last 90 days."],
  [
    { recency_days: 100, tenure_days: 200, purchases_90d: 0 },
    "spend_90d",
    "£0: they bought nothing in the last 90 days.",
  ],
  [{ spend_prev_90d: 450 }, "total_spend", "At least the spend of the last 180 days (£550)."],
  [
    { tenure_days: 22 },
    "n_purchase_days",
    "At most 3: every purchase day falls between the first and the last.",
  ],
  [
    { recency_days: 200, tenure_days: 400, purchases_90d: 0, spend_90d: 0 },
    "spend_prev_90d",
    "£0: their last purchase was 180 or more days ago.",
  ],
  [
    { tenure_days: 60, purchases_90d: 1, spend_prev_90d: 0 },
    "purchases_90d",
    "All 5: their first purchase was within the last 90 days.",
  ],
  [{ tenure_days: 60 }, "spend_prev_90d", "£0: their first purchase was within the last 90 days."],
  [
    { tenure_days: 60, purchases_90d: 5, spend_prev_90d: 0 },
    "spend_90d",
    "The total spend (£500): their first purchase was within the last 90 days.",
  ],
  [
    { purchases_90d: 5, spend_90d: 400 },
    "spend_prev_90d",
    "£0: every purchase day is within the last 90 days.",
  ],
])("%o is flagged on %s", (edit, field, message) => {
  expect(problems({ ...base, ...edit }, fields)).toContainEqual({ field, message });
});

test("a field gets one message, and a field that is wrong on its own skips the rules", () => {
  const found = problems({ ...base, purchases_90d: 6.5 }, fields);
  expect(found.filter((p) => p.field === "purchases_90d")).toEqual([
    { field: "purchases_90d", message: "Enter a whole number." },
  ]);
});

test("the reorder preset is one more purchase day of their usual size, 30 days ago", () => {
  expect(reorderedAgo(base)).toBeNull(); // they last bought 20 days ago
  const quiet = {
    ...base,
    recency_days: 122,
    tenure_days: 564,
    n_purchase_days: 6,
    purchases_90d: 0,
    spend_90d: 0,
    spend_prev_90d: 348.15,
    total_spend: 3118.48,
  };
  expect(problems(quiet, fields)).toEqual([]);
  const next = reorderedAgo(quiet);
  expect(next).toMatchObject({
    recency_days: 30,
    n_purchase_days: 7,
    purchases_90d: 1,
    spend_90d: 519.75,
    total_spend: 3638.23,
  });
  expect(problems(next ?? {}, fields)).toEqual([]);
});

test("the model input is rebuilt in model order, with derived and context features", () => {
  const expected = fixtureFeatures(100, 30);
  const x = Array.from(modelFeatures(base, spec));
  spec.order.forEach((name, i) => {
    expect(x[i]).toBeCloseTo(expected[name] ?? Number.NaN, 12);
  });
  const later = Array.from(modelFeatures({ ...base, recency_days: 60 }, spec));
  expect(later[spec.order.indexOf("cadence_days")]).toBeCloseTo(20, 12); // (140 − 60) / 4
  expect(later[spec.order.indexOf("overdue_ratio")]).toBeCloseTo(3, 12);
});

test("the priced answer uses the recomputed Gamma-Gamma value and cadence", () => {
  const priced = price(base, 0.5, spec, DEFAULT_SCENARIO);
  const value = 0.35 * expectedAov(spec.gamma_gamma, 5, 100) * (365 / 30);
  expect(priced.p).toBe(0.5);
  expect(priced.value).toBeCloseTo(value, 9);
  expect(priced.incentive).toBeCloseTo(0.1 * value, 9);
  expect(priced.expProfit).toBeCloseTo(0.5 * 0.3 * 0.9 * value - 0.5 * 0.1 * value - 1, 9);
});

test("the Platt calibrator reproduces a golden case, isotonic interpolates and clips", () => {
  const platt = {
    model: "m",
    calibrator: {
      method: "platt" as const,
      slope: 6.896707074003348,
      intercept: -3.001321444194543,
    },
  };
  expect(calibrate(0.19439683839799923, platt)).toBeCloseTo(0.1596783315119201, 12);
  const isotonic: CalibratorFile = {
    model: "m",
    calibrator: { method: "isotonic" as const, x: [0.1, 0.5, 0.9], y: [0.05, 0.3, 0.8] },
  };
  expect(calibrate(0, isotonic)).toBe(0.05);
  expect(calibrate(1, isotonic)).toBe(0.8);
  expect(calibrate(0.5, isotonic)).toBeCloseTo(0.3, 12);
  expect(calibrate(0.3, isotonic)).toBeCloseTo(0.175, 12);
});

test("sha256Hex matches the standard test vector", async () => {
  const bytes = new TextEncoder().encode("abc");
  expect(await sha256Hex(bytes.buffer)).toBe(
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const installed = existsSync(`${DATA}customers.json`);
const read = (name: string): unknown => JSON.parse(readFileSync(`${DATA}${name}.json`, "utf8"));

test.skipIf(!installed)(
  "every holdout customer passes the rules, and rebuilds the served input and value",
  () => {
    const real = validateArtifact("feature_spec", read("feature_spec"));
    const customers = validateArtifact("customers", read("customers"));
    const realFields = editableFields(real);
    const table = buildTable(customers);
    const rows = new Map(
      customerRows(table, runCampaign(table, DEFAULT_SCENARIO), DEFAULT_SCENARIO).map((r) => [
        r.id,
        r,
      ]),
    );
    for (const customer of customers.customers) {
      const id = String(customer.customer_id);
      const values = baseValues(customer.features, real);
      expect(problems(values, realFields), id).toEqual([]);
      const next = reorderedAgo(values);
      if (next) {
        const rules = problems(next, realFields).filter((p) => !p.message.startsWith("Between"));
        expect(rules, id).toEqual([]);
      }
      const x = modelFeatures(values, real);
      real.order.forEach((name, i) => {
        const served = customer.features[name] ?? Number.NaN;
        expect(close(x[i] ?? Number.NaN, served, 1e-9), `${id} ${name}`).toBe(true);
      });
      const row = rows.get(customer.customer_id);
      if (!row) throw new Error(`no row for ${id}`);
      const priced = price(values, row.p, real, DEFAULT_SCENARIO);
      expect(close(priced.value, row.value, 1e-9), id).toBe(true);
      expect(close(priced.expProfit, row.expProfit, 1e-9, 1e-9), id).toBe(true);
    }
  },
);

test.skipIf(!installed)(
  "the installed model.onnx matches its SHA-256 in the manifest",
  async () => {
    const manifest = validateArtifact("manifest", read("manifest"));
    const file = readFileSync(`${DATA}model.onnx`);
    const bytes = file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength);
    expect(await sha256Hex(bytes)).toBe(manifest.files["model.onnx"]);
  },
);
