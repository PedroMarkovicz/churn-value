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
  localFiles,
  type ArtifactsLock,
  manifestFiles,
  mismatches,
  readLock,
  sha256File,
  unpackVerified,
  untarGz,
} from "./artifacts-lib.ts";

const WEB = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(WEB, "public", "data");
const LOCK = join(WEB, "artifacts.lock.json");
const LOCAL = join(WEB, "..", "ml", "artifacts");
const REPOSITORY = "PedroMarkovicz/churn-value";

/** Copy exactly the listed files, after each matched its SHA-256; nothing else is installed. */
function install(from: string, files: Record<string, string>): void {
  const bad = mismatches(from, files);
  if (bad.length > 0) throw new Error(`checksum mismatch in ${from}: ${bad.join(", ")}`);
  rmSync(OUT, { recursive: true, force: true });
  for (const name of Object.keys(files)) {
    mkdirSync(dirname(join(OUT, name)), { recursive: true });
    cpSync(join(from, name), join(OUT, name));
  }
  console.log(`artifacts -> public/data (${Object.keys(files).length} files verified)`);
}

function headers(accept: string): Record<string, string> {
  const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN;
  return token ? { Accept: accept, Authorization: `Bearer ${token}` } : { Accept: accept };
}

/** The bytes of a release asset. */
async function downloadAsset(repository: string, tag: string, asset: string): Promise<Buffer> {
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
  return Buffer.from(await body.arrayBuffer());
}

/** Write unpacked files (already checked for safe paths) into a fresh temporary directory. */
function writeTemp(files: Map<string, Buffer>): string {
  const dir = mkdtempSync(join(tmpdir(), "churn-value-artifacts-"));
  for (const [path, data] of files) {
    mkdirSync(dirname(join(dir, path)), { recursive: true });
    writeFileSync(join(dir, path), data);
  }
  return dir;
}

async function fromLock(): Promise<void> {
  const lock = readLock(LOCK);
  if (existsSync(OUT) && mismatches(OUT, lock.files).length === 0) {
    console.log(`artifacts ${lock.tag} already in public/data`);
    return;
  }
  // The archive's checksum is verified before a single entry is read or written.
  const bytes = await downloadAsset(lock.repository, lock.tag, lock.asset);
  const dir = writeTemp(unpackVerified(bytes, lock.asset_sha256));
  install(dir, lock.files);
  rmSync(dir, { recursive: true, force: true });
}

async function pin(tag: string): Promise<void> {
  const asset = `${tag}.tar.gz`; // the name .github/workflows/train.yml gives it
  const bytes = await downloadAsset(REPOSITORY, tag, asset);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const dir = writeTemp(untarGz(bytes)); // pinning trusts this release; paths are still checked
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
  install(LOCAL, localFiles(LOCAL));
} else if (values.pin) {
  await pin(values.pin);
} else {
  await fromLock();
}
