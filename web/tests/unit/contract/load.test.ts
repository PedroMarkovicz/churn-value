import {
  ArtifactError,
  clearArtifactCache,
  loadArtifact,
  validateArtifact,
} from "@/contract/load.ts";
import { isCompatible } from "@/contract/version.ts";

import { manifestFixture } from "../fixtures/artifacts.ts";

function respond(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status }));
}

afterEach(() => {
  clearArtifactCache();
  vi.unstubAllGlobals();
});

test("a valid manifest is fetched once and cached", async () => {
  const fetchMock = vi.fn(() => respond(200, manifestFixture()));
  vi.stubGlobal("fetch", fetchMock);
  const first = await loadArtifact("manifest", "/data/");
  const second = await loadArtifact("manifest", "/data/");
  expect(first).toBe(second);
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock).toHaveBeenCalledWith("/data/manifest.json");
});

test("an invalid artifact names the file and the first bad field", () => {
  const broken = { ...manifestFixture(), models: [{ name: "m", label: "M", family: "x" }] };
  expect(() => validateArtifact("manifest", broken)).toThrow(ArtifactError);
  try {
    validateArtifact("manifest", broken);
  } catch (error) {
    const artifactError = error as ArtifactError;
    expect(artifactError.artifact).toBe("manifest.json");
    expect(artifactError.reason).toMatch(/^\/models\/0/);
  }
});

test("an HTTP error is reported with its status and can be retried", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => respond(404, {})),
  );
  await expect(loadArtifact("manifest", "/data/")).rejects.toThrow("manifest.json: HTTP 404");
  vi.stubGlobal(
    "fetch",
    vi.fn(() => respond(200, manifestFixture())),
  );
  await expect(loadArtifact("manifest", "/data/")).resolves.toMatchObject({
    test_cutoff: "2011-09-10",
  });
});

test("a manifest from another major contract version is refused", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => respond(200, { ...manifestFixture(), contract_version: "2.0.0" })),
  );
  await expect(loadArtifact("manifest", "/data/")).rejects.toThrow(
    /contract 2\.0\.0 cannot be read/,
  );
});

test.each([
  ["1.1.0", true],
  ["1.4.2", true],
  ["1.0.0", false],
  ["2.1.0", false],
  ["1.1", false],
])("contract %s is compatible with an app built for 1.1.0: %s", (version, expected) => {
  expect(isCompatible(version, "1.1.0")).toBe(expected);
});

test("a newer minor version with an added field is still read", async () => {
  const newer = { ...manifestFixture(), contract_version: "1.2.0", added_in_1_2: "anything" };
  vi.stubGlobal(
    "fetch",
    vi.fn(() => respond(200, newer)),
  );
  await expect(loadArtifact("manifest", "/data/")).resolves.toMatchObject({
    contract_version: "1.2.0",
  });
});

test("another major version is reported as such, even when its shape changed", async () => {
  const other = { contract_version: "2.0.0", renamed: true };
  vi.stubGlobal(
    "fetch",
    vi.fn(() => respond(200, other)),
  );
  await expect(loadArtifact("manifest", "/data/")).rejects.toThrow(
    "manifest.json: contract 2.0.0 cannot be read by this app (built for 1.1.0)",
  );
});
