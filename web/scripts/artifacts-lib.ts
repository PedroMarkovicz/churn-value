/**
 * Pinned artifacts (spec §6.1): the site is built from one GitHub Release of the `train` workflow,
 * identified by its tag and the SHA-256 of every file. Pure helpers; the CLI is fetch-artifacts.ts.
 */
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";

export interface ArtifactsLock {
  repository: string; // "owner/name"
  tag: string; // release tag, e.g. "artifacts-20260928-d51cf16"
  asset: string; // tarball name inside the release
  asset_sha256: string;
  files: Record<string, string>; // path relative to the artifacts root -> SHA-256
}

export function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

export function readLock(path: string): ArtifactsLock {
  const lock = JSON.parse(readFileSync(path, "utf8")) as Partial<ArtifactsLock>;
  for (const key of ["repository", "tag", "asset", "asset_sha256", "files"] as const) {
    if (lock[key] === undefined) throw new Error(`${path} has no "${key}"`);
  }
  return lock as ArtifactsLock;
}

/** Every file in `expected` that is missing from `dir` or has another hash (empty = all good). */
export function mismatches(dir: string, expected: Record<string, string>): string[] {
  return Object.entries(expected)
    .filter(([name, digest]) => {
      const path = join(dir, name);
      return !existsSync(path) || sha256File(path) !== digest;
    })
    .map(([name]) => name);
}

/** The files the manifest in `dir` lists with their SHA-256 (it does not list itself). */
export function manifestFiles(dir: string): Record<string, string> {
  const manifest = JSON.parse(readFileSync(join(dir, "manifest.json"), "utf8")) as {
    files: Record<string, string>;
  };
  return manifest.files;
}

/** The files of a local export: those its manifest lists, and the manifest, which lists
 * every file but itself. Without it the site has nothing to read first. */
export function localFiles(dir: string): Record<string, string> {
  return { ...manifestFiles(dir), "manifest.json": sha256File(join(dir, "manifest.json")) };
}

/** A relative path that stays inside the target directory; anything else is refused. */
function safePath(path: string): string {
  const parts = path.split(/[\\/]/); // tar writes "/", but Windows also resolves "\"
  if (/^[a-zA-Z]:/.test(path) || path.startsWith("/") || parts.includes("..")) {
    throw new Error(`the archive has an unsafe path: ${path}`);
  }
  return parts.filter((part) => part !== "" && part !== ".").join("/");
}

/** The files of a release tarball, after its SHA-256 matched the one in the lock. */
export function unpackVerified(archive: Buffer, expectedSha256: string): Map<string, Buffer> {
  const actual = createHash("sha256").update(archive).digest("hex");
  if (actual !== expectedSha256) {
    throw new Error(`the archive has SHA-256 ${actual}, the lock expects ${expectedSha256}`);
  }
  return untarGz(archive);
}

/**
 * The regular files of a .tar.gz (ustar, as GNU tar writes it), keyed by path without "./".
 * Enough for our release tarball; directories, links and pax headers are skipped.
 */
export function untarGz(archive: Buffer): Map<string, Buffer> {
  const tar = gunzipSync(archive);
  const files = new Map<string, Buffer>();
  const text = (start: number, length: number) =>
    tar.toString("utf8", start, start + length).replace(/\0.*$/s, "");
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const name = text(offset, 100);
    if (name === "") break; // two zero blocks end the archive
    const size = parseInt(text(offset + 124, 12).trim() || "0", 8);
    const type = text(offset + 156, 1);
    const prefix = text(offset + 345, 155);
    const path = (prefix ? `${prefix}/${name}` : name).replace(/^\.\//, "");
    const start = offset + 512;
    if ((type === "0" || type === "") && path !== "") {
      files.set(safePath(path), tar.subarray(start, start + size));
    }
    offset = start + Math.ceil(size / 512) * 512;
  }
  return files;
}
