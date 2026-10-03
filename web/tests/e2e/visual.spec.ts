/**
 * Visual regression (spec §9 item 7): the six pages at the default scenario, compared with
 * baselines made in the same pinned Linux container (.github/workflows/visual-baselines.yml).
 * Never run on a developer machine: fonts and anti-aliasing differ by platform.
 */
import { expect, type Page, test } from "@playwright/test";

const PAGES = [
  ["overview", "/"],
  ["simulator", "/simulator"],
  ["sensitivity", "/sensitivity"],
  ["customers", "/customers"],
  ["model", "/model"],
  ["method", "/method"],
] as const;

async function settled(page: Page) {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  // charts computed in the worker, and the lazily rendered model card, have finished
  await expect(page.locator("[aria-busy=true]")).toHaveCount(0);
  await expect(page.getByText(/^(Updating intervals|Loading the model card)…$/)).toHaveCount(0);
}

for (const [name, path] of PAGES) {
  test(`${name} matches its baseline`, async ({ page }) => {
    await page.goto(path);
    await settled(page);
    await expect(page).toHaveScreenshot(`${name}.png`, { fullPage: true });
  });
}
