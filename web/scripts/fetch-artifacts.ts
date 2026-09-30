/**
 * Put the artifacts the site reads into public/data (git-ignored).
 *
 *   npm run artifacts               the release pinned in artifacts.lock.json (CI, reviewers)
 *   npm run artifacts -- --local    ../ml/artifacts from a local `churnvalue export`
 *   npm run artifacts -- --pin TAG  download release TAG and write artifacts.lock.json
 *
 * Every file is checked against its SHA-256 before it is installed. A private repository needs
 * GITHUB_TOKEN (or GH_TOKEN) in the environment; a public one does not.
 */
import { createHash } from "node:crypto";
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import {
  type ArtifactsLock,
  manifestFiles,
  mismatches,
  readLock,
  sha256File,
  untarGz,
} from "./artifacts-lib.ts";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(WEB, "public", "data");
const LOCK = join(WEB, "artifacts.lock.json");
const LOCAL = join(WEB, "..", "ml", "artifacts");
const REPOSITORY = "PedroMarkovicz/churn-value";

function install(from: string, files: Record<string, string>): void {
  const bad = mismatches(from, files);
  if (bad.length > 0) throw new Error(`checksum mismatch in ${from}: ${bad.join(", ")}`);
  rmSync(OUT, { recursive: true, force: true });
  cpSync(from, OUT, { recursive: true });
  console.log(`artifacts -> public/data (${Object.keys(files).length} files verified)`);
}

function headers(accept: string): Record<string, string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return token ? { Accept: accept, Authorization: `Bearer ${token}` } : { Accept: accept };
}

/** Download a release asset and unpack it into a fresh temporary directory. */
async function downloadRelease(
  repository: string,
  tag: string,
  asset: string,
): Promise<{ dir: string; sha256: string }> {
  const api = `https://api.github.com/repos/${repository}/releases/tags/${tag}`;
  const release = await fetch(api, { headers: headers("application/vnd.github+json") });
  if (!release.ok)
    throw new Error(`${api}: HTTP ${release.status} (private repo? set GITHUB_TOKEN)`);
  const { assets } = (await release.json()) as { assets: { name: string; url: string }[] };
  const found = assets.find((a) => a.name === asset);
  if (!found) throw new Error(`release ${tag} has no asset ${asset}`);
  // The asset URL redirects to storage; fetch drops the token on that cross-origin hop.
  const body = await fetch(found.url, { headers: headers("application/octet-stream") });
  if (!body.ok) throw new Error(`${found.url}: HTTP ${body.status}`);
  const bytes = Buffer.from(await body.arrayBuffer());
  const dir = mkdtempSync(join(tmpdir(), "churn-value-artifacts-"));
  for (const [path, data] of untarGz(bytes)) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), data);
  }
  return { dir, sha256: createHash("sha256").update(bytes).digest("hex") };
}

async function fromLock(): Promise<void> {
  const lock = readLock(LOCK);
  if (existsSync(OUT) && mismatches(OUT, lock.files).length === 0) {
    console.log(`artifacts ${lock.tag} already in public/data`);
    return;
  }
  const { dir, sha256 } = await downloadRelease(lock.repository, lock.tag, lock.asset);
  if (sha256 !== lock.asset_sha256) throw new Error(`${lock.asset} has SHA-256 ${sha256}`);
  install(dir, lock.files);
  rmSync(dir, { recursive: true, force: true });
}

async function pin(tag: string): Promise<void> {
  const asset = `${tag}.tar.gz`; // the name .github/workflows/train.yml gives it
  const { dir, sha256 } = await downloadRelease(REPOSITORY, tag, asset);
  const files = { ...manifestFiles(dir), "manifest.json": sha256File(join(dir, "manifest.json")) };
  const lock: ArtifactsLock = { repository: REPOSITORY, tag, asset, asset_sha256: sha256, files };
  install(dir, files);
  writeFileSync(LOCK, JSON.stringify(lock, null, 2) + "\n", "utf8");
  rmSync(dir, { recursive: true, force: true });
  console.log(`pinned ${tag} in artifacts.lock.json`);
}

const { values } = parseArgs({
  options: { local: { type: "boolean", default: false }, pin: { type: "string" } },
});
if (values.local) {
  if (!existsSync(join(LOCAL, "manifest.json"))) {
    throw new Error("ml/artifacts has no manifest.json: run `uv run churnvalue export` in ml/");
  }
  install(LOCAL, manifestFiles(LOCAL));
} else if (values.pin) {
  await pin(values.pin);
} else {
  await fromLock();
}
