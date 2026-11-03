import { expect, test, type APIRequestContext } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { mkdirSync } from "node:fs";
const endpoint = "/api/mobile-workspace/";
const artifacts = "artifacts/governance-v2/mobile-workspace";
async function signIn(request: APIRequestContext, userId = "usr_gh_doctor") {
  const response = await request.post(endpoint + "session", { data: { userId, role: "admin", facilityId: "fac_eu_northbridge" } });
  expect(response.status()).toBe(200);
  const value = await response.json();
  return { value, headers: { authorization: `Bearer ${value.sessionId}` } };
}

test("mobile API refuses anonymous, cookie-only, malformed-token and foreign-origin requests", async ({ request }) => {
  expect((await request.get(endpoint + "dashboard")).status()).toBe(401);
  expect((await request.get(endpoint + "dashboard", { headers: { cookie: "cura_session=ses_invalid000", authorization: "Bearer invalid" } })).status()).toBe(401);
  const refused = await request.get(endpoint + "directory", { headers: { origin: "https://untrusted.example" } });
  expect(refused.status()).toBe(403);
  expect(refused.headers()["access-control-allow-origin"]).toBeUndefined();
  const preflight = await request.fetch(endpoint + "dashboard", { method: "OPTIONS", headers: { origin: "http://127.0.0.1:8082", "access-control-request-method": "GET", "access-control-request-headers": "authorization" } });
  expect(preflight.status()).toBe(204);
  expect(preflight.headers()["access-control-allow-origin"]).toBe("http://127.0.0.1:8082");
  expect(preflight.headers()["access-control-allow-credentials"]).toBeUndefined();
  expect((await request.post(endpoint + "session", { data: { userId: [] } })).status()).toBe(400);
  expect((await request.post(endpoint + "session", { data: "malformed", headers: { "content-type": "application/json" } })).status()).toBe(400);
});

test("mobile reads the same persisted clinical data and preserves tenant and financial boundaries", async ({ request }) => {
  const { value, headers } = await signIn(request);
  try {
    expect(value.dataClass).toBe("synthetic");
    expect(value.facilityName).toBe("Accra Central Medical Centre");
    expect(value.permissions).not.toContain("billing.charge.read");
    const dashboard = await request.get(endpoint + "dashboard", { headers });
    expect(dashboard.status()).toBe(200);
    expect(dashboard.headers()["cache-control"]).toBe("no-store");
    const overview = await dashboard.json();
    const roster = await (await request.get(endpoint + "patients", { headers })).json();
    expect(overview.metrics.find((m: { label: string }) => m.label === "Patients").count).toBeGreaterThan(0);
    expect(overview.rows.every((row: { id: string }) => roster.records.some((p: { id: string }) => p.id === row.id))).toBe(true);
    const chart = await request.get(endpoint + "chart/pat_gh_kofi_a", { headers });
    expect(chart.status()).toBe(200);
    const body = await chart.json();
    expect(body.patient.mrn).toBe("ACC-4401");
    expect(body.sections.charges).toBeUndefined();
    expect(JSON.stringify(body.sections.billingStatus)).not.toContain("total_minor");
    expect((await request.get(endpoint + "chart/pat_eu_kofi", { headers })).status()).toBe(404);
    expect((await request.get(endpoint + "charges", { headers })).status()).toBe(403);
    expect((await request.post(endpoint + "dashboard", { headers, data: { count: 999 } })).status()).toBe(405);
    expect((await request.get(endpoint + "unknown", { headers })).status()).toBe(404);
    expect((await request.post(endpoint + "signout", { headers })).status()).toBe(200);
    expect((await request.get(endpoint + "patients", { headers })).status()).toBe(401);
  } finally { await request.post(endpoint + "signout", { headers }); }
});

test("billing access is separate from clinical detail and patient preview CORS is restricted", async ({ request }) => {
  const { headers } = await signIn(request, "usr_gh_billing");
  try {
    expect((await request.get(endpoint + "charges", { headers })).status()).toBe(200);
    const chart = await request.get(endpoint + "chart/pat_gh_kofi_a", { headers });
    if (chart.status() === 200) {
      const body = await chart.json();
      expect(body.sections.conditions).toEqual({ denied: true });
      expect(body.sections.observations).toEqual({ denied: true });
    } else expect(chart.status()).toBe(403);
    const allowed = await request.fetch("/api/patient-app/directory", { method: "OPTIONS", headers: { origin: "http://127.0.0.1:8082" } });
    expect(allowed.status()).toBe(204);
    expect(allowed.headers()["access-control-allow-origin"]).toBe("http://127.0.0.1:8082");
    const blocked = await request.get("/api/patient-app/directory", { headers: { origin: "http://untrusted.example:8082" } });
    expect(blocked.status()).toBe(403);
  } finally { await request.post(endpoint + "signout", { headers }); }
});

test("mobile browser workspace loads real records, clears failed views and signs out", async ({ page, request }) => {
  mkdirSync(artifacts, { recursive: true });
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  await page.addInitScript(() => { localStorage.setItem("curasphere.landing.v6", "1"); localStorage.setItem("curasphere.host.v2", "127.0.0.1"); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(process.env.CURASPHERE_MOBILE_URL ?? "http://127.0.0.1:8082");
  await page.getByRole("button", { name: /Care team/ }).click();
  await page.getByRole("button", { name: /Kwame Boateng/ }).click();
  await expect(page.getByText("Your day, connected.", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `${artifacts}/dashboard-phone.png`, fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole("tab", { name: "Patients", exact: true }).click();
  await page.getByRole("textbox", { name: "Search patients", exact: true }).fill("ACC-4401");
  await page.getByRole("button", { name: "Search patients", exact: true }).click();
  await page.getByRole("button", { name: /Kofi Mensah.*ACC-4401/ }).click();
  await expect(page.getByText("Simulation record · Not for live clinical use", { exact: true })).toBeVisible();
  await expect(page.getByText("Observations", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze()).violations).toEqual([]);
  await page.screenshot({ path: `${artifacts}/chart-phone.png`, fullPage: true });
  await expect(page.getByRole("tab", { name: "Charges", exact: true })).toHaveCount(0);
  await page.getByRole("tab", { name: "Home", exact: true }).click();
  await page.route("**/api/mobile-workspace/dashboard", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "unavailable" }), headers: { "access-control-allow-origin": "http://127.0.0.1:8082" } }));
  await page.getByRole("button", { name: "Refresh workspace", exact: true }).click();
  await expect(page.getByText("This view is temporarily unavailable. Try again.", { exact: true })).toBeVisible();
  await expect(page.getByText("Your day, connected.", { exact: true })).toHaveCount(0);
  await page.unroute("**/api/mobile-workspace/dashboard");
  await page.getByRole("tab", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(page.getByText("Choose your workspace identity", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => Object.values(localStorage).some(v => /ses_[a-z0-9_-]+/i.test(v)))).toBe(false);
  expect(pageErrors).toEqual([]);
});
