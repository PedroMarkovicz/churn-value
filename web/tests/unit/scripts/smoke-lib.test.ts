// @vitest-environment node
import { createHash } from "node:crypto";

import { checkSite, type Fetch } from "../../../scripts/smoke-lib.ts";

const BASE = "https://churn-value.example.workers.dev";
const HOME =
  '<!doctype html><html><head><script type="module" crossorigin src="/assets/index-C-iBrRCz.js">' +
  '</script></head><body><div id="root"></div></body></html>';
const MANIFEST = '{"contract_version":"1.2.0"}';
const SHA = createHash("sha256").update(MANIFEST).digest("hex");
const NOTEBOOKS = Array.from(
  { length: 11 },
  (_, i) => `${String(i + 1).padStart(2, "0")}_stage_${"abcdefghijk".charAt(i)}.html`,
);
const INDEX = NOTEBOOKS.map((name) => `<a href="${name}">${name}</a>`).join("");
const SECURE = { "x-content-type-options": "nosniff" };
const IMMUTABLE = { "cache-control": "public, max-age=31536000, immutable" };

type Page = { body: string; status?: number; headers?: Record<string, string> };

/** A fake site. A path it does not list gets the app, as Cloudflare's SPA fallback does. */
function site(overrides: Record<string, Page | null> = {}): Fetch {
  const pages: Record<string, Page | null> = {
    "/": { body: HOME, headers: SECURE },
    "/model": { body: HOME, headers: SECURE },
    "/assets/index-C-iBrRCz.js": { body: "export {}", headers: IMMUTABLE },
    "/data/manifest.json": { body: MANIFEST },
    "/notebooks/": { body: INDEX },
    "/notebooks/01_stage_a.html": { body: '<body><nav class="cv-bar"></nav></body>' },
    ...overrides,
  };
  const fallback: Page = { body: HOME, headers: SECURE };
  return (url) => {
    const path = new URL(url).pathname;
    const page = path in pages ? pages[path] : fallback;
    if (!page) return Promise.reject(new TypeError("fetch failed"));
    return Promise.resolve(
      new Response(page.body, { status: page.status ?? 200, headers: page.headers ?? {} }),
    );
  };
}

test("a healthy site passes every check", async () => {
  expect(await checkSite(BASE, SHA, site())).toEqual([]);
});

test("a site without the notebook pages fails", async () => {
  const get: Fetch = (url) =>
    new URL(url).pathname.startsWith("/notebooks")
      ? Promise.resolve(new Response(HOME, { headers: SECURE })) // the SPA fallback
      : site()(url);
  expect(await checkSite(BASE, SHA, get)).toEqual(["/notebooks/: 0 notebooks listed, not 11"]);
});

test("another release's manifest fails", async () => {
  const failures = await checkSite(
    BASE,
    SHA,
    site({ "/data/manifest.json": { body: '{"contract_version":"1.1.0"}' } }),
  );
  expect(failures).toEqual(["/data/manifest.json: not the release pinned in artifacts.lock.json"]);
});

test("a direct link that does not open the app fails", async () => {
  expect(await checkSite(BASE, SHA, site({ "/model": { body: "", status: 404 } }))).toEqual([
    "/model: HTTP 404",
  ]);
});

test("an asset without the immutable cache rule fails", async () => {
  const failures = await checkSite(
    BASE,
    SHA,
    site({ "/assets/index-C-iBrRCz.js": { body: "export {}" } }),
  );
  expect(failures).toEqual([
    "/assets/index-C-iBrRCz.js: Cache-Control is missing, not public, max-age=31536000, immutable",
  ]);
});

test("a page that is not the app, or lacks the security header, fails", async () => {
  const other = { body: "<h1>Hello</h1>" };
  expect(await checkSite(BASE, SHA, site({ "/": other, "/model": other }))).toEqual([
    "/: not the app's page",
    "/: no X-Content-Type-Options: nosniff",
    "/: no script under /assets/",
  ]);
});

test("a notebook page without the top bar fails", async () => {
  const failures = await checkSite(
    BASE,
    SHA,
    site({ "/notebooks/01_stage_a.html": { body: "<body></body>" } }),
  );
  expect(failures).toEqual(["/notebooks/01_stage_a.html: no top bar"]);
});

test("an unreachable site is reported, not thrown", async () => {
  const down: Fetch = () => Promise.reject(new TypeError("fetch failed"));
  expect(await checkSite(BASE, SHA, down)).toEqual([
    "/: fetch failed",
    "/data/manifest.json: fetch failed",
    "/notebooks/: fetch failed",
  ]);
});
