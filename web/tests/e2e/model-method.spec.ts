import { expect, test } from "@playwright/test";

import { manifest } from "./data.ts";

const deployed = manifest.models.find((m) => m.deployable)?.label ?? "";

test("the Model page renders every chart from the evaluation", async ({ page }) => {
  await page.goto("/model");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "The model promised 32% would leave and 31% did. That is why its profit held up.",
  );
  for (const name of [
    `Only ${deployed} stays calibrated after June`,
    `Only ${deployed} made close to what it promised`,
    "The top 3 are alike on ROC-AUC: their intervals overlap",
    new RegExp(`^${deployed.replace(/[+]/g, "\\+")}: predicted`),
    /features hold; the largest shift is in days since first purchase$/,
  ]) {
    await expect(page.getByRole("heading", { level: 2, name })).toBeVisible();
  }
  const strip = page.getByRole("region", { name: "Reproducible run" });
  await expect(strip).toContainText("40 Optuna trials per model, seed 42, 5 rolling-origin folds");
  await strip.getByRole("button", { name: "Experiment runs" }).click();
  await expect(page.getByRole("dialog", { name: "Experiment runs" }).getByRole("row")).toHaveCount(
    4,
  );
});

test("the Method page renders its figures and the release's model card", async ({ page }) => {
  await page.goto("/method");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "Nobody tells a wholesaler they are leaving. The label has to be built.",
  );
  await expect(page.getByRole("img", { name: /An illustrative customer/ })).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "Learn from 10 past months, calibrate on June, judge on September",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "The value estimate is conservative" }),
  ).toBeVisible();
  const card = page.locator("#model-card");
  await expect(card.getByRole("heading", { name: "Model details" })).toBeVisible();
  await expect(card).toContainText(manifest.git_sha); // the card describes this very release
  await expect(page.getByRole("link", { name: "The analysis notebooks" })).toHaveAttribute(
    "href",
    "/notebooks/",
  );
});

test("the run strip's link lands on the model card", async ({ page }) => {
  await page.goto("/model");
  await page.getByRole("link", { name: "Model card" }).click();
  await expect(page).toHaveURL(/\/method#model-card$/);
  await expect(
    page.locator("#model-card").getByRole("heading", { name: "Model details" }),
  ).toBeVisible();
});

test("a model card that does not match its checksum is reported in its place", async ({ page }) => {
  await page.route("**/model_card.md", (route) => route.fulfill({ body: "# Tampered card\n" }));
  await page.goto("/method");
  await expect(page.locator("#model-card")).toContainText(
    "The model card could not be read: model_card.md: does not match its SHA-256 in the manifest.",
  );
  await expect(
    page.getByRole("heading", { name: "The value estimate is conservative" }),
  ).toBeVisible();
});
