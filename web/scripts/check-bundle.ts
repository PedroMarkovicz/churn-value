/**
 * `npm run check:bundle` after a build: the JavaScript the first page load needs must stay under
 * 200 KB gzip (spec §8). Workers and lazily loaded chunks are not part of the first load.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const DIST = fileURLToPath(new URL("../dist/", import.meta.url));
const LIMIT = 200 * 1024;

const html = readFileSync(join(DIST, "index.html"), "utf8");
const scripts = [...html.matchAll(/<(?:script|link)[^>]+(?:src|href)="\/?([^"]+\.js)"/g)].map(
  (m) => m[1] as string,
);
const total = scripts.reduce(
  (sum, file) => sum + gzipSync(readFileSync(join(DIST, file))).length,
  0,
);
console.log(
  `initial JavaScript: ${(total / 1024).toFixed(1)} KB gzip in ${scripts.length} file(s), limit ${LIMIT / 1024} KB`,
);
if (total > LIMIT) process.exit(1);
