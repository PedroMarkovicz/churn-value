/**
 * What a served copy of the site must answer. Used on the live address after a deploy and against
 * `wrangler dev` in CI; `get` is a parameter so the checks are unit-tested.
 */
import { createHash } from "node:crypto";

export const NOTEBOOK_COUNT = 11;
/** A path no build has: Cloudflare answers it with the app's page (the SPA fallback). */
const MISSING_ASSET = "/assets/smoke-test-missing.js";

export type Fetch = (url: string, init?: { signal?: AbortSignal }) => Promise<Response>;

export type Options = {
  /** The index.html that was published: when given, `/` must be exactly it. */
  indexHtml?: string;
  /** How long one request may take before it counts as a failure. */
  timeoutMs?: number;
};

type Answer = { response: Response; text: string };

function sha256(bytes: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

/** True if a browser would reuse a response with this Cache-Control without asking again. */
function keptByBrowsers(cacheControl: string): boolean {
  const maxAge = /max-age=(\d+)/i.exec(cacheControl)?.[1];
  return /immutable/i.test(cacheControl) || (maxAge !== undefined && Number(maxAge) > 0);
}

/** Every failed check as one sentence; an empty list means the site is as expected. */
export async function checkSite(
  base: string,
  manifestSha256: string,
  get: Fetch = fetch,
  options: Options = {},
): Promise<string[]> {
  const { indexHtml, timeoutMs = 15_000 } = options;
  const failures: string[] = [];
  /** One request. A server that does not answer is a recorded failure, never a throw or a hang. */
  const request = async (path: string): Promise<Answer | null> => {
    try {
      const signal = AbortSignal.timeout(timeoutMs);
      const response = await get(new URL(path, base).href, { signal });
      return { response, text: await response.clone().text() };
    } catch (error) {
      failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };
  const page = async (path: string): Promise<Answer | null> => {
    const answer = await request(path);
    if (answer && answer.response.status !== 200) {
      failures.push(`${path}: HTTP ${answer.response.status}`);
      return null;
    }
    return answer;
  };

  const home = await page("/");
  if (home) {
    if (!home.text.includes('<div id="root">')) failures.push("/: not the app's page");
    else if (indexHtml !== undefined && home.text !== indexHtml)
      failures.push("/: not the build that was just published (its index.html differs)");
    if (home.response.headers.get("x-content-type-options") !== "nosniff")
      failures.push("/: no X-Content-Type-Options: nosniff");
    const deep = await page("/model");
    if (deep && deep.text !== home.text) failures.push("/model: a direct link is not the app");
    const script = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(home.text)?.[1];
    if (!script) failures.push("/: no script under /assets/");
    else {
      const asset = await page(script);
      const type = asset?.response.headers.get("content-type") ?? "nothing";
      if (asset && !type.includes("javascript"))
        failures.push(`${script}: served as ${type}, not JavaScript`);
    }
    // The fallback page under an asset's address must not be kept: a browser that asked for a
    // chunk a moment too early, or after a rollback, would hold the wrong content for good.
    const missing = await request(MISSING_ASSET);
    const cache = missing?.response.headers.get("cache-control") ?? "";
    if (missing && keptByBrowsers(cache))
      failures.push(
        `${MISSING_ASSET}: a missing file is answered with Cache-Control ${cache}; ` +
          "a browser would keep the wrong content",
      );
  }

  const manifest = await page("/data/manifest.json");
  if (manifest && sha256(await manifest.response.arrayBuffer()) !== manifestSha256)
    failures.push("/data/manifest.json: not the release pinned in artifacts.lock.json");

  const index = await page("/notebooks/");
  if (index) {
    const links = [...index.text.matchAll(/href="(\d\d_[a-z_]+\.html)"/g)].map(
      (match) => match[1] as string,
    );
    if (links.length !== NOTEBOOK_COUNT)
      failures.push(`/notebooks/: ${links.length} notebooks listed, not ${NOTEBOOK_COUNT}`);
    const first = links[0];
    if (first) {
      const notebook = await page(`/notebooks/${first}`);
      if (notebook && !notebook.text.includes('class="cv-bar"'))
        failures.push(`/notebooks/${first}: no top bar`);
    }
  }
  return failures;
}
