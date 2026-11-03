import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tools/e2e",
  timeout: 240_000,
  expect: { timeout: 30_000 },
  workers: 1,
  retries: 0,
  reporter: [["list"], ["json", { outputFile: process.env.CURASPHERE_E2E_REPORT ?? "docs/healthcare/P04-F05-e2e-results.json" }]],
  use: {
    baseURL: process.env.CURASPHERE_E2E_BASE_URL ?? "http://127.0.0.1:3105",
    browserName: "chromium",
    channel: process.env.CURASPHERE_E2E_BROWSER === "chromium" ? undefined : "chrome",
    headless: true,
    actionTimeout: 30_000,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
});
