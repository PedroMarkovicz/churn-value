// @vitest-environment node
import { createHash } from "node:crypto";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

import { mismatches, readLock, untarGz } from "../../../scripts/artifacts-lib.ts";

/** A minimal ustar archive, as `tar -czf x.tar.gz -C artifacts .` lays it out. */
function tarGz(entries: [string, string, "0" | "5"][]): Buffer {
  const blocks: Buffer[] = [];
  for (const [name, body, type] of entries) {
    const header = Buffer.alloc(512);
    header.write(name, 0, "utf8");
    header.write(body.length.toString(8).padStart(11, "0"), 124, "utf8");
    header.write(type, 156, "utf8");
    header.write("ustar\u000000", 257, "utf8");
    blocks.push(header);
    const data = Buffer.alloc(Math.ceil(body.length / 512) * 512);
    data.write(body, 0, "utf8");
    blocks.push(data);
  }
  blocks.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(blocks));
}

test("untarGz returns regular files keyed by path, without directories or ./", () => {
  const long = "x".repeat(700); // spans two data blocks
  const files = untarGz(
    tarGz([
      ["./", "", "5"],
      ["./manifest.json", '{"a":1}', "0"],
      ["./golden/", "", "5"],
      ["./golden/model.json", long, "0"],
    ]),
  );
  expect([...files.keys()]).toEqual(["manifest.json", "golden/model.json"]);
  expect(files.get("manifest.json")?.toString()).toBe('{"a":1}');
  expect(files.get("golden/model.json")?.toString()).toBe(long);
});

test("mismatches lists missing files and files with another hash", () => {
  const dir = mkdtempSync(join(tmpdir(), "artifacts-test-"));
  writeFileSync(join(dir, "a.json"), "a");
  writeFileSync(join(dir, "b.json"), "b");
  const sha = (text: string) => createHash("sha256").update(text).digest("hex");
  expect(mismatches(dir, { "a.json": sha("a"), "b.json": sha("b") })).toEqual([]);
  expect(mismatches(dir, { "a.json": sha("a"), "b.json": sha("x"), "c.json": sha("c") })).toEqual([
    "b.json",
    "c.json",
  ]);
});

test("readLock names the missing key", () => {
  const dir = mkdtempSync(join(tmpdir(), "artifacts-test-"));
  const path = join(dir, "lock.json");
  writeFileSync(
    path,
    JSON.stringify({ repository: "o/r", tag: "t", asset: "t.tar.gz", files: {} }),
  );
  expect(() => readLock(path)).toThrow('has no "asset_sha256"');
});
