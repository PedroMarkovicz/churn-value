/**
 * `npm run og` while `npm run preview` is serving the build: writes public/og.png, the 1200×630
 * image a shared link shows. Look at it before committing it; no test compares it.
 */
import { fileURLToPath } from "node:url";

import { chromium } from "@playwright/test";

const address = process.argv[2] ?? "http://localhost:4173/";
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: 1200, height: 630 },
  deviceScaleFactor: 1,
});
await page.goto(address, { waitUntil: "networkidle" });
await page.evaluate(async () => {
  await document.fonts.ready;
});
const path = fileURLToPath(new URL("../public/og.png", import.meta.url));
await page.screenshot({ path });
await browser.close();
console.log(`social preview -> ${path}`);
