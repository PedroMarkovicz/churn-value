// @vitest-environment node
import { ArtifactError, clearArtifactCache, loadModelCard, MODEL_CARD } from "@/contract/load.ts";
import { sha256Hex } from "@/workers/integrity.ts";

import { manifestFixture } from "../fixtures/artifacts.ts";

const CARD = "# Model card — churn-value\n\nA test card.\n";
const encode = (text: string) => new TextEncoder().encode(text).buffer;

async function serve(card: string | null, listed: string | null) {
  const files: Record<string, string> = listed === null ? {} : { [MODEL_CARD]: listed };
  const manifest = manifestFixture({ files: { ...manifestFixture().files, ...files } });
  vi.stubGlobal(
    "fetch",
    vi.fn((url: string) => {
      if (url.endsWith("manifest.json"))
        return Promise.resolve(new Response(JSON.stringify(manifest)));
      if (url.endsWith(MODEL_CARD) && card !== null) return Promise.resolve(new Response(card));
      return Promise.resolve(new Response("", { status: 404 }));
    }),
  );
}

beforeEach(() => {
  clearArtifactCache();
});
afterEach(() => {
  vi.unstubAllGlobals();
});

test("the card is served once its SHA-256 matches the manifest", async () => {
  await serve(CARD, await sha256Hex(encode(CARD)));
  expect(await loadModelCard("/data/")).toBe(CARD);
});

test("a card that does not match the manifest is refused", async () => {
  await serve(`${CARD}tampered`, await sha256Hex(encode(CARD)));
  await expect(loadModelCard("/data/")).rejects.toThrow(
    /model_card\.md: does not match its SHA-256/,
  );
});

test("a release without a card says so", async () => {
  await serve(null, null);
  const error = await loadModelCard("/data/").catch((e: unknown) => e);
  expect(error).toBeInstanceOf(ArtifactError);
  expect(String(error)).toMatch(/is not in this release/);
});

test("a listed card that cannot be fetched names the HTTP status", async () => {
  await serve(null, "0".repeat(64));
  await expect(loadModelCard("/data/")).rejects.toThrow(/model_card\.md: HTTP 404/);
});
