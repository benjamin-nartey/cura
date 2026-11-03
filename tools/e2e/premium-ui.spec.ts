import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";

const artifacts = "artifacts/governance-v2/premium-ui";
test("enterprise landing and login work across screen sizes", async ({ page }) => {
  mkdirSync(artifacts, { recursive: true });
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/");
    await expect(page.getByRole("heading", { name: "Better connected. More human." })).toBeVisible();
    await page.getByRole("link", { name: "Discover CuraSphere" }).click();
    await expect(page).toHaveURL(/#platform$/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.goto("/");
    await page.screenshot({ path: `${artifacts}/landing-${width}.png`, fullPage: true });
    await page.getByRole("link", { name: "Sign in", exact: false }).click();
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
    await expect(page.getByRole("link", { name: "Continue with your organization" })).toHaveAttribute("href", "/api/auth/start");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
    await page.screenshot({ path: `${artifacts}/login-${width}.png`, fullPage: true });
  }
  await page.goto("/?error=expired");
  await expect(page).toHaveURL(/\/login\?error=expired$/);
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
});

test("synthetic identity opens the refreshed workspace", async ({ page }) => {
  await page.goto("/login");
  await page.locator(".development-login summary").click();
  await page.getByLabel("Workspace identity").selectOption("usr_gh_doctor");
  await page.getByRole("button", { name: "Open workspace" }).click();
  await expect(page).toHaveURL(/dashboard/);
  await expect(page.getByRole("heading", { name: /Welcome back,/ })).toBeVisible();
  await expect(page.getByRole("region", { name: "Product notice" })).toHaveCount(0);
  const patients = page.locator(".metric-link").filter({ has: page.locator(".metric-label", { hasText: /^Patients$/ }) });
  await expect(patients.locator(".metric-value")).not.toHaveText("0");
  await expect(page.locator(".ward-table tbody tr")).not.toHaveCount(0);
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `${artifacts}/dashboard-1440.png`, fullPage: true });
  await page.goto("/patients/pat_gh_kofi_a/chart");
  await expect(page.getByRole("heading", { name: "Kofi Mensah" })).toBeVisible();
  await page.screenshot({ path: `${artifacts}/chart-1440.png`, fullPage: true });
});
