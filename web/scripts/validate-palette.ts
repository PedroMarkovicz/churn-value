/**
 * `npm run palette`: fail when a data palette breaks a check it is not documented to break
 * (spec §3.2). Warnings oblige direct labels or a table view, which every chart has.
 */
import { MODEL_SLOTS, MONEY, OUTCOME, SURFACE } from "../src/charts/palette.ts";
import { checkPalette, type Finding } from "./palette-lib.ts";

// The outcome tints are context colours by design: the field ships a counted legend, the linked
// account and a table view instead of relying on their contrast or lightness.
const DOCUMENTED = new Set([
  "lightness band:#9db3ee",
  "chroma floor:#9db3ee",
  "lightness band:#dcdfea",
  "chroma floor:#dcdfea",
]);

const palettes: Record<string, readonly string[]> = {
  money: [MONEY.profit, MONEY.loss],
  models: MODEL_SLOTS,
  outcomes: [OUTCOME.hit, OUTCOME.waste, OUTCOME.miss, OUTCOME.quiet],
};

let failed = false;
for (const [name, colors] of Object.entries(palettes)) {
  const findings = checkPalette(colors, SURFACE);
  const blocking = findings.filter(
    (f: Finding) =>
      f.level === "fail" && !DOCUMENTED.has(`${f.check}:${f.detail.split(" ")[0] ?? ""}`),
  );
  const status = blocking.length > 0 ? "FAIL" : "ok";
  console.log(`${status.padEnd(4)} ${name}`);
  for (const f of findings) console.log(`     ${f.level} ${f.check}: ${f.detail}`);
  failed ||= blocking.length > 0;
}
if (failed) process.exit(1);
