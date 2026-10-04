// @vitest-environment node
import { unhashed } from "../../../scripts/assets-lib.ts";

test("names with Vite's content hash pass", () => {
  expect(
    unhashed([
      "index-C-iBrRCz.js",
      "index-CziWA31R.css",
      "ModelRoute-_e8uwEvb.js",
      "ort-wasm-simd-threaded-DcHrbrbl.wasm",
      "public-sans-latin-400-normal-8Rpg0ruU.woff2",
    ]),
  ).toEqual([]);
});

test("a file without a content hash is named", () => {
  expect(unhashed(["index-C-iBrRCz.js", "logo.png", "index.js", "font-abc.woff2"])).toEqual([
    "logo.png",
    "index.js",
    "font-abc.woff2",
  ]);
});
