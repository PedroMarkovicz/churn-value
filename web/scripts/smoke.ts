/**
 * `npm run smoke -- <url> [--wait seconds] [--index file]`: check a served copy of the site.
 * With no address it checks the live site, `VITE_SITE_URL` in `.env`. `--wait` retries until the
 * checks pass or the time is up, for a server that is still starting or a deploy still spreading.
 * `--index` is the built index.html: the site must serve exactly it, which tells the build that
 * was just published from the one before it.
 */
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { checkSite } from "./smoke-lib.ts";

const { values, positionals } = parseArgs({
  options: { wait: { type: "string", default: "0" }, index: { type: "string" } },
  allowPositionals: true,
});
const base = positionals[0] ?? process.env.VITE_SITE_URL;
if (!base) {
  console.error(
    "usage: npm run smoke -- <url> [--wait seconds] [--index file]  (or set VITE_SITE_URL in .env)",
  );
  process.exit(2);
}
const lock = JSON.parse(
  readFileSync(fileURLToPath(new URL("../artifacts.lock.json", import.meta.url)), "utf8"),
) as { files: Record<string, string> };
const expected = lock.files["manifest.json"];
if (!expected) {
  console.error("artifacts.lock.json has no checksum for manifest.json");
  process.exit(2);
}
if (values.index !== undefined && !existsSync(values.index)) {
  console.error(`--index ${values.index}: no such file (build the site first)`);
  process.exit(2);
}
const options = values.index === undefined ? {} : { indexHtml: readFileSync(values.index, "utf8") };

const deadline = Date.now() + Number(values.wait) * 1000;
let failures = await checkSite(base, expected, fetch, options);
while (failures.length > 0 && Date.now() < deadline) {
  await new Promise((resolve) => setTimeout(resolve, 3000));
  failures = await checkSite(base, expected, fetch, options);
}
if (failures.length > 0) {
  console.error(`smoke test failed for ${base}:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`smoke test passed for ${base}`);
