// @vitest-environment node
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { generate, OUT_DIR } from "../../../scripts/contract-codegen.ts";

test("the committed contract code matches the schemas (npm run gen:contract)", async () => {
  const files = await generate();
  for (const [relative, text] of files) {
    expect(readFileSync(join(OUT_DIR, relative), "utf8"), relative).toBe(text);
  }
  const committed = readdirSync(join(OUT_DIR, "types")).sort();
  const expected = [...files.keys()]
    .filter((path) => path.startsWith("types/"))
    .map((path) => path.slice("types/".length))
    .sort();
  expect(committed).toEqual(expected);
});
