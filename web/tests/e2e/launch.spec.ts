import { expect, test } from "@playwright/test";

const PAGES = [
  ["/", "Overview"],
  ["/simulator", "Simulator"],
  ["/sensitivity", "Sensitivity"],
  ["/customers", "Customers"],
  ["/model", "Model"],
  ["/method", "Method"],
] as const;

test("each page has its own title", async ({ page }) => {
  for (const [path, label] of PAGES) {
    await page.goto(path);
    await expect(page).toHaveTitle(`${label} · churn-value`);
  }
});

test("an unknown address is titled as not found", async ({ page }) => {
  await page.goto("/no-such-page");
  await expect(page).toHaveTitle("Page not found · churn-value");
});

test("the favicon and the social preview exist and are what they say", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await expect(page.locator('link[rel="icon"]')).toHaveAttribute("href", "/favicon.svg");
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    "content",
    "summary_large_image",
  );
  const image = await page.locator('meta[property="og:image"]').getAttribute("content");
  expect(image).toMatch(/^https:\/\/churn-value\.[a-z0-9-]+\.workers\.dev\/og\.png$/);
  for (const [path, type] of [
    ["/favicon.svg", "image/svg+xml"],
    ["/og.png", "image/png"],
  ] as const) {
    const response = await request.get(path);
    expect(response.status(), path).toBe(200);
    expect(response.headers()["content-type"], path).toContain(type);
  }
});
