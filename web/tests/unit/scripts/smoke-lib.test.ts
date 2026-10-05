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
const SECURE = {
  "x-content-type-options": "nosniff",
  "x-frame-options": "DENY",
  "strict-transport-security": "max-age=31536000",
};
const IMMUTABLE = { "cache-control": "public, max-age=31536000, immutable" };
const SCRIPT = { "content-type": "text/javascript; charset=utf-8" };

type Page = { body: string; status?: number; headers?: Record<string, string> };

/** A fake site. A path it does not list gets the app, as Cloudflare's SPA fallback does. */
function site(overrides: Record<string, Page | null> = {}): Fetch {
  const pages: Record<string, Page | null> = {
    "/": { body: HOME, headers: SECURE },
    "/model": { body: HOME, headers: SECURE },
    "/assets/index-C-iBrRCz.js": { body: "export {}", headers: SCRIPT },
    "/data/manifest.json": { body: MANIFEST },
    "/notebooks/": { body: INDEX },
    "/notebooks/01_stage_a.html": { body: '<body><nav class="cv-bar"></nav></body>' },
    "/favicon.svg": { body: "<svg/>", headers: { "content-type": "image/svg+xml" } },
    "/og.png": { body: "png", headers: { "content-type": "image/png" } },
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

test("an entry script that is answered with the app's page fails", async () => {
  const failures = await checkSite(
    BASE,
    SHA,
    site({
      "/assets/index-C-iBrRCz.js": {
        body: HOME,
        headers: { "content-type": "text/html; charset=utf-8" },
      },
    }),
  );
  expect(failures).toEqual([
    "/assets/index-C-iBrRCz.js: served as text/html; charset=utf-8, not JavaScript",
  ]);
});

test("a missing file under /assets/ that a browser would keep fails", async () => {
  const failures = await checkSite(
    BASE,
    SHA,
    site({ "/assets/smoke-test-missing.js": { body: HOME, headers: IMMUTABLE } }),
  );
  expect(failures).toEqual([
    "/assets/smoke-test-missing.js: a missing file is answered with Cache-Control " +
      "public, max-age=31536000, immutable; a browser would keep the wrong content",
  ]);
});

test("a site still serving another build fails, and the published build passes", async () => {
  expect(await checkSite(BASE, SHA, site(), { indexHtml: HOME })).toEqual([]);
  const newer = HOME.replace("C-iBrRCz", "NEWBUILD");
  expect(await checkSite(BASE, SHA, site(), { indexHtml: newer })).toEqual([
    "/: not the build that was just published (its index.html differs)",
  ]);
});

test("a server that accepts and never answers is given up on", async () => {
  const silent: Fetch = (_url, init) =>
    new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => {
        reject(new Error("timed out"));
      });
    });
  const failures = await checkSite(BASE, SHA, silent, { timeoutMs: 20 });
  expect(failures).toEqual([
    "/: timed out",
    "/data/manifest.json: timed out",
    "/notebooks/: timed out",
  ]);
});

test("a page that is not the app, or lacks the security header, fails", async () => {
  const other = { body: "<h1>Hello</h1>" };
  expect(await checkSite(BASE, SHA, site({ "/": other, "/model": other }))).toEqual([
    "/: not the app's page",
    "/: no X-Content-Type-Options: nosniff",
    "/: no X-Frame-Options: DENY",
    "/: no Strict-Transport-Security with a long max-age",
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

test("a social image that is missing, and so answered with the app's page, fails", async () => {
  const get: Fetch = (url) =>
    new URL(url).pathname === "/og.png"
      ? Promise.resolve(new Response(HOME, { headers: { "content-type": "text/html" } }))
      : site()(url);
  expect(await checkSite(BASE, SHA, get)).toEqual(["/og.png: served as text/html, not image/png"]);
});

test("a page that another site could frame, or that does not ask for HTTPS, fails", async () => {
  const page = { body: HOME, headers: { "x-content-type-options": "nosniff" } };
  expect(await checkSite(BASE, SHA, site({ "/": page, "/model": page }))).toEqual([
    "/: no X-Frame-Options: DENY",
    "/: no Strict-Transport-Security with a long max-age",
  ]);
});
