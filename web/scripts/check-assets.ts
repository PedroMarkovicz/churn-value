/**
 * `npm run check:assets` after a build: every file under dist/assets must carry a content hash
 * in its name, because public/_headers tells browsers to keep those files for a year.
 */
import { existsSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { unhashed } from "./assets-lib.ts";

const ASSETS = fileURLToPath(new URL("../dist/assets/", import.meta.url));
if (!existsSync(ASSETS)) {
  console.error("dist/assets does not exist: run `npm run build` first");
  process.exit(1);
}
const names = readdirSync(ASSETS, { recursive: true, withFileTypes: true })
  .filter((entry) => entry.isFile())
  .map((entry) => entry.name);
const bad = unhashed(names);
console.log(`dist/assets: ${names.length} file(s), ${bad.length} without a content hash`);
if (names.length === 0 || bad.length > 0) {
  for (const name of bad) console.error(`  - ${name}`);
  process.exit(1);
}
