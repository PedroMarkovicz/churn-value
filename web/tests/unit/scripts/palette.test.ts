// @vitest-environment node
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { MAGNITUDE, MODEL_SLOTS, MONEY, modelColor, OUTCOME } from "@/charts/palette.ts";

import { checkPalette, contrast, deltaE } from "../../../scripts/palette-lib.ts";

test.each([
  // pairs measured with the dataviz reference validator while the palette was chosen
  ["#2F5BD3", "#B8352F", "protan", 25.9],
  ["#2F5BD3", "#B8352F", undefined, 31.6],
  ["#EDA100", "#1BAF7A", "protan", 9.1],
  ["#E87BA4", "#EDA100", undefined, 19.6],
  ["#0E8BA6", "#008300", undefined, 19.4],
  ["#B8352F", "#1E9E6A", "deutan", 9.7],
] as const)("ΔE(%s, %s, %s) = %s", (a, b, vision, expected) => {
  expect(deltaE(a, b, vision)).toBeCloseTo(expected, 1);
});

test("WCAG contrast of black on white is 21:1", () => {
  expect(contrast("#000000", "#ffffff")).toBeCloseTo(21, 6);
});

test("the model and money palettes pass every hard check", () => {
  for (const colors of [MODEL_SLOTS, [MONEY.profit, MONEY.loss]]) {
    expect(checkPalette(colors, "#ffffff").filter((f) => f.level === "fail")).toEqual([]);
  }
  expect(modelColor(0)).toBe("#2a78d6");
  expect(modelColor(8)).toBeNull(); // a ninth model is never given a generated hue
});

test("the CSS tokens use the same data colours as the palette module", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../../../src/styles/index.css", import.meta.url)),
    "utf8",
  );
  const token = (name: string) => new RegExp(`--color-${name}: *(#[0-9a-f]{6})`).exec(css)?.[1];
  expect(token("profit")).toBe(MONEY.profit);
  expect(token("loss")).toBe(MONEY.loss);
  expect(token("midpoint")).toBe(MONEY.midpoint);
  for (const [name, hex] of Object.entries(OUTCOME)) expect(token(name)).toBe(hex);
});

test("no model name is written in the app's source (models come from the manifest)", () => {
  const src = fileURLToPath(new URL("../../../src", import.meta.url));
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((name) => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? files(path) : [path];
    });
  const names = ["cadence_rule", "bgnbd", "logreg", "lightgbm", "BG/NBD", "LightGBM"];
  const offenders = files(src)
    .filter((path) => !path.includes(".gen."))
    .filter((path) => names.some((name) => readFileSync(path, "utf8").includes(name)));
  expect(offenders).toEqual([]);
});

test("the magnitude ramp is one hue getting steadily darker, with its tokens in step", () => {
  const css = readFileSync(
    fileURLToPath(new URL("../../../src/styles/index.css", import.meta.url)),
    "utf8",
  );
  const token = (name: string) => new RegExp(`--color-${name}: *(#[0-9a-f]{6})`).exec(css)?.[1];
  MAGNITUDE.ramp.forEach((hex, i) => {
    expect(token(`magnitude-${i + 1}`)).toBe(hex);
  });
  expect(token("no-data")).toBe(MAGNITUDE.none);
  const darkness = MAGNITUDE.ramp.map((hex) => contrast(hex, "#ffffff"));
  darkness.slice(1).forEach((value, i) => {
    expect(value).toBeGreaterThan(darkness[i] as number);
  });
});
