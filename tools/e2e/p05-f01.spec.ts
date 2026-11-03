import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";

async function signIn(page: Page, id: string) {
  await page.goto("/login");
  await page.locator(".development-login summary").click();
  await page.getByLabel("Workspace identity").selectOption(id);
  await page.locator('form[action="/api/session"] button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/);
}

test("organization administrator registers an immutable version and clinicians read provenance", async ({ page, browser }) => {
  await signIn(page, "usr_gh_admin");
  await page.goto("/terminology");
  const version = `e2e-${Date.now()}`;
  await page.getByLabel("Name", { exact: true }).fill("Care pathway vocabulary");
  await page.getByLabel("Version", { exact: true }).fill(version);
  await page.getByLabel("Edition", { exact: true }).fill("Local simulation");
  await page.getByLabel("Effective from", { exact: true }).fill("2026-01-01");
  await page.getByLabel("Provenance URL").fill("https://example.org/curasphere/vocabulary");
  await page.getByLabel("Provenance note").fill("Locally authored vocabulary for synthetic care workflow verification.");
  await page.getByLabel("Concept manifest (JSON)").fill(JSON.stringify([{ code: "follow-up", display: "Follow-up review" }]));
  await page.getByRole("button", { name: "Register version", exact: true }).click();
  await expect(page).toHaveURL(/terminology\/.+/);
  await expect(page.getByRole("heading", { name: "Care pathway vocabulary", exact: true })).toBeVisible();
  await expect(page.getByText("Follow-up review", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);
  mkdirSync("artifacts/governance-v2/P05-F01", { recursive: true });
  await page.screenshot({ path: "artifacts/governance-v2/P05-F01/release-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "artifacts/governance-v2/P05-F01/release-mobile.png", fullPage: true });
  const detail = page.url();
  const context = await browser.newContext();
  const clinician = await context.newPage();
  await signIn(clinician, "usr_gh_doctor");
  await clinician.goto(detail);
  await expect(clinician.getByText("Follow-up review", { exact: true })).toBeVisible();
  await clinician.goto("/terminology");
  await expect(clinician.getByRole("button", { name: "Register version", exact: true })).toHaveCount(0);
  expect((await clinician.request.post("/api/terminology/releases", { data: {} })).status()).toBe(403);
  await context.close();
});

test("registry API rejects anonymous, cross-origin and malformed writes and unknown codes", async ({ page, request }) => {
  expect((await request.get("/api/terminology/releases")).status()).toBe(401);
  await signIn(page, "usr_gh_admin");
  expect((await page.request.post("/api/terminology/releases", { headers: { origin: "https://foreign.example" }, data: {} })).status()).toBe(403);
  expect((await page.request.post("/api/terminology/releases", { headers: { "content-type": "application/json" }, data: "{" })).status()).toBe(422);
  const result = await page.request.get("/api/terminology/lookup?system=urn:missing&version=unknown&code=unknown");
  expect(result.status()).toBe(422);
  expect(result.headers()["cache-control"]).toBe("no-store");
});

test("API retries are idempotent and tenant isolation and content restrictions hold", async ({ page, browser }) => {
  await signIn(page, "usr_gh_admin");
  const body = { systemUri: "urn:curasphere:synthetic:org_demo_gh:e2e-api", name: "Workflow codes", version: `v-${Date.now()}`, edition: "Local", activeFrom: "2026-01-01", rights: "synthetic", sourceUrl: "https://example.org/workflow", sourceNote: "Locally authored synthetic workflow test concepts.", concepts: [{ code: "review", display: "Review scheduled" }], idempotencyKey: `e2e-${Date.now()}` };
  const created = await page.request.post("/api/terminology/releases", { data: body });
  expect(created.status()).toBe(201);
  const receipt = await created.json();
  const retry = await page.request.post("/api/terminology/releases", { data: body });
  expect(retry.status()).toBe(200);
  expect((await retry.json()).id).toBe(receipt.id);
  expect((await page.request.post("/api/terminology/releases", { data: { ...body, name: "Changed vocabulary" } })).status()).toBe(409);
  const query = new URLSearchParams({ system: body.systemUri, version: body.version, code: "review" });
  expect((await page.request.get(`/api/terminology/lookup?${query}`)).status()).toBe(200);
  const restricted = { ...body, systemUri: "http://loinc.org", rights: "reference-only", idempotencyKey: `restricted-${Date.now()}` };
  expect((await page.request.post("/api/terminology/releases", { data: restricted })).status()).toBe(403);
  expect((await page.request.post("/api/terminology/releases", { data: { ...restricted, concepts: [] } })).status()).toBe(201);
  const official = new URLSearchParams({ system: "http://loinc.org", version: body.version, code: "review" });
  expect((await page.request.get(`/api/terminology/lookup?${official}`)).status()).toBe(403);
  const context = await browser.newContext();
  const foreign = await context.newPage();
  await signIn(foreign, "usr_eu_admin");
  const listed = await foreign.request.get("/api/terminology/releases");
  expect((await listed.json()).releases.some((r: { id: string }) => r.id === receipt.id)).toBe(false);
  await foreign.goto(`/terminology/${receipt.id}`);
  await expect(foreign.getByRole("heading", { name: "Release unavailable" })).toBeVisible();
  await context.close();
});
