import { readFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { customers, deployedPolicy, nodeChurnProbability } from "./data.ts";

const ID = 13052; // the mockup's customer: overdue, on the list at the defaults

test("a shared customer link opens the drawer, and the what-if matches the model run in Node", async ({
  page,
}) => {
  await page.goto(`/customers?customer=${ID}`);
  const drawer = page.getByRole("dialog", { name: `Customer ${ID}` });
  await expect(drawer).toBeVisible();
  const served =
    customers.customers.find((c) => c.customer_id === ID)?.p[customers.deployed_model] ??
    Number.NaN;
  const expected = await nodeChurnProbability(ID, { recency_days: 300 });
  expect(Math.abs(expected - served)).toBeGreaterThan(0.001); // the edit moves the answer
  await drawer.getByLabel("Days since last purchase").fill("300");
  const result = drawer.getByRole("status", { name: "What-if result" });
  await expect(result).toContainText(`${(served * 100).toFixed(1)}%`, { timeout: 30_000 });
  await expect(result).toContainText(`${(expected * 100).toFixed(1)}%`, { timeout: 30_000 });
});

test("the drawer keeps working when the model cannot load", async ({ page }) => {
  await page.route("**/*.wasm", (route) => route.abort());
  await page.goto(`/customers?customer=${ID}`);
  const drawer = page.getByRole("dialog", { name: `Customer ${ID}` });
  await drawer.getByLabel("Days since last purchase").fill("100");
  await expect(drawer.getByRole("status", { name: "What-if result" })).toContainText(
    "The model could not run in this browser",
    { timeout: 30_000 },
  );
  await expect(drawer.getByRole("heading", { name: "The money" })).toBeVisible();
});

test("a row opens the drawer, Esc closes it, and Back brings it back", async ({ page }) => {
  await page.goto("/customers");
  await page.getByLabel("Find a customer").fill(String(ID));
  await page.getByRole("button", { name: `Open customer ${ID}` }).click();
  const drawer = page.getByRole("dialog", { name: `Customer ${ID}` });
  await expect(drawer).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`[?&]customer=${ID}(&|$)`));
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(page).not.toHaveURL(/customer=/);
  await page.goBack();
  await expect(drawer).toBeVisible();
});

test("Download CSV saves the customers to call, named by the scenario", async ({ page }) => {
  await page.goto("/customers");
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download CSV" }).click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/^churn-value-customers-.+\.csv$/);
  const lines = (await readFile(await file.path(), "utf8")).trimEnd().split("\n");
  expect(lines[0]).toMatch(/^rank,customer_id,decision,p_churn,/);
  expect(lines.length - 1).toBe(deployedPolicy().n_contacted);
});

test("clicking a square on the Overview opens that customer", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("img", { name: /customers called/ }).click({ position: { x: 2, y: 2 } });
  await expect(page).toHaveURL(/\/customers\?(.*&)?customer=\d+/);
  await expect(page.getByRole("dialog")).toBeVisible();
});

test("no accessibility violations with the drawer open", async ({ page }) => {
  await page.goto(`/customers?customer=${ID}`);
  await expect(page.getByRole("dialog", { name: `Customer ${ID}` })).toBeVisible();
  await page.waitForLoadState("networkidle");
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
    .analyze();
  expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
});
