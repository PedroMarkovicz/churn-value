import { defineConfig, devices } from "@playwright/test";

const CI = Boolean(process.env.CI);

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  forbidOnly: CI,
  retries: CI ? 1 : 0,
  reporter: CI ? [["html", { open: "never" }], ["github"]] : "list",
  use: { baseURL: "http://localhost:4173", trace: "retain-on-failure" },
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  // A strict comparison, possible because the pinned container renders identically from run to
  // run: `threshold` is the colour difference a pixel may have and still count as equal (the
  // default 0.2 treats neighbouring steps of a colour ramp as the same pixel), and at most 100
  // pixels may differ (a ratio would allow thousands on a long page).
  expect: {
    toHaveScreenshot: {
      threshold: 0.02,
      maxDiffPixels: 100,
      animations: "disabled",
      caret: "hide",
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] }, testIgnore: /visual\.spec\.ts/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /visual\.spec\.ts/ },
    {
      name: "visual-desktop",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
      testMatch: /visual\.spec\.ts/,
    },
    { name: "visual-mobile", use: { ...devices["Pixel 7"] }, testMatch: /visual\.spec\.ts/ },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !CI,
  },
});
