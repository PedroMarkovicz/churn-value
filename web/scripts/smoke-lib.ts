/**
 * What a served copy of the site must answer. Used on the live address after a deploy and against
 * `wrangler dev` in CI; `get` is a parameter so the checks are unit-tested.
 */
import { createHash } from "node:crypto";

export const NOTEBOOK_COUNT = 11;
const IMMUTABLE = "public, max-age=31536000, immutable";

export type Fetch = (url: string) => Promise<Response>;

function sha256(bytes: ArrayBuffer): string {
  return createHash("sha256").update(Buffer.from(bytes)).digest("hex");
}

/** Every failed check as one sentence; an empty list means the site is as expected. */
export async function checkSite(
  base: string,
  manifestSha256: string,
  get: Fetch = fetch,
): Promise<string[]> {
  const failures: string[] = [];
  const page = async (path: string): Promise<{ response: Response; text: string } | null> => {
    try {
      const response = await get(new URL(path, base).href);
      const text = await response.clone().text();
      if (response.status !== 200) {
        failures.push(`${path}: HTTP ${response.status}`);
        return null;
      }
      return { response, text };
    } catch (error) {
      failures.push(`${path}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  };

  const home = await page("/");
  if (home) {
    if (!home.text.includes('<div id="root">')) failures.push("/: not the app's page");
    if (home.response.headers.get("x-content-type-options") !== "nosniff")
      failures.push("/: no X-Content-Type-Options: nosniff");
    const deep = await page("/model");
    if (deep && deep.text !== home.text) failures.push("/model: a direct link is not the app");
    const script = /<script[^>]+src="(\/assets\/[^"]+\.js)"/.exec(home.text)?.[1];
    if (!script) failures.push("/: no script under /assets/");
    else {
      const asset = await page(script);
      const cache = asset?.response.headers.get("cache-control");
      if (asset && cache !== IMMUTABLE)
        failures.push(`${script}: Cache-Control is ${cache ?? "missing"}, not ${IMMUTABLE}`);
    }
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
