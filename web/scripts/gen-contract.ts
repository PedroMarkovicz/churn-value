import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { generate, OUT_DIR } from "./contract-codegen.ts";

for (const [relative, text] of await generate()) {
  const path = join(OUT_DIR, relative);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, text, "utf8");
  console.log(`contract -> src/contract/${relative}`);
}
