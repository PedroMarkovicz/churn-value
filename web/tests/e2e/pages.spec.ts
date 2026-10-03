import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

import { breakEven, customers, deployedPolicy, gbp } from "./data.ts";

test("the overview headline and account match the Python evaluation", async ({ page }) => {
  const policy = deployedPolicy();
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `Of ${customers.customers.length.toLocaleString("en-GB")} customers due to buy again, calling ${policy.n_contacted.toLocaleString("en-GB")} earned ${gbp(policy.realized_profit)}.`,
  );
  const account = page.getByRole("region", { name: "Campaign account" });
  await expect(account).toContainText(gbp(policy.realized_profit));
  await expect(account).toContainText(
    `Expected before the outcomes were known: ${gbp(policy.expected_profit ?? 0)}`,
  );
});

test("moving acceptance changes the list, the headline and the link", async ({ page }) => {
  await page.goto("/simulator");
  const heading = page.getByRole("heading", { level: 1 });
  const before = await heading.textContent();
  await page.getByRole("slider", { name: "Acceptance" }).focus();
  await page.keyboard.press("PageUp"); // +10 points
  await expect(heading).not.toHaveText(before ?? "");
  await expect(page).toHaveURL(/[?&]g=0\.4(&|$)/);
  await page.reload();
  await expect(page.getByText("Acceptance 40%")).toBeVisible();
});

test("the sensitivity headline gives the analytic break-even for a shared link", async ({
  page,
}) => {
  await page.goto("/sensitivity?g=0.4");
  const gammaStar = (breakEven(0.4) * 100).toFixed(1);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    `This list keeps paying as long as at least ${gammaStar}% of churners accept the offer.`,
  );
});

for (const path of ["/", "/simulator", "/sensitivity", "/customers", "/model", "/method"]) {
  test(`no accessibility violations on ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag22aa"])
      .analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
}

test("an unknown page offers the way back", async ({ page }) => {
  await page.goto("/nowhere");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(
    "There is no page at this address.",
  );
});

for (const path of ["/", "/simulator", "/sensitivity", "/customers", "/model", "/method"]) {
  test(`${path} never scrolls sideways`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
  });
}

test("charts still render when the compute worker cannot load", async ({ page }) => {
  await page.route("**/compute.worker*", (route) => route.fulfill({ status: 404 }));
  await page.goto("/sensitivity");
  // the tornado and the rebuilt stress line come from the worker; the main thread takes over
  await expect(
    page.getByRole("heading", { name: /matters more than|moves the result more/ }),
  ).toBeVisible({
    timeout: 15_000,
  });
  await page.goto("/simulator");
  const frame = page.getByRole("region", { name: /perfect foresight/ });
  await expect(frame.getByText("Updating intervals…")).toBeHidden({ timeout: 15_000 });
});

test("Model and Method show fixed results instead of the scenario strip", async ({ page }) => {
  for (const path of ["/model", "/method"]) {
    await page.goto(path);
    await expect(page.getByText(/^Fixed results at the default scenario:/)).toBeVisible();
    await expect(page.getByRole("region", { name: "Scenario" })).toHaveCount(0);
  }
});
