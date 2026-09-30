// @vitest-environment node
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { validateArtifact, type ArtifactName } from "@/contract/load.ts";

const DATA = fileURLToPath(new URL("../../../public/data/", import.meta.url));
const NAMES: ArtifactName[] = [
  "manifest",
  "customers",
  "timelines",
  "evaluation",
  "experiments",
  "feature_spec",
  "calibrator",
];

// The real artifacts are git-ignored; this runs wherever `npm run artifacts` has installed them.
test.skipIf(!existsSync(`${DATA}manifest.json`))(
  "the installed artifacts match the contract",
  () => {
    for (const name of NAMES) {
      const data: unknown = JSON.parse(readFileSync(`${DATA}${name}.json`, "utf8"));
      expect(() => validateArtifact(name, data), name).not.toThrow();
    }
  },
);
