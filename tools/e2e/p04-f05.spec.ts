import { selectOpenFollowUpSlot } from "./booking";
import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import path from "node:path";
import { mkdirSync } from "node:fs";

function screenshotPath(name: string) {
  const directory = process.env.CURASPHERE_E2E_ARTIFACTS ?? "docs/healthcare";
  mkdirSync(directory, { recursive: true });
  return path.join(directory, name);
}

async function signIn(page: Page, userId: string) {
  await page.goto("/login");
  await page.locator(".development-login summary").click();
  await page.getByLabel("Workspace identity").selectOption(userId);
  await page.locator('form[action="/api/session"] button[type="submit"]').click();
  await expect(page).toHaveURL(/dashboard/);
}

async function signOut(page: Page) {
  await page.locator('.account > button[aria-haspopup="menu"]').click();
  await page.locator('form[action="/api/session/end"] button').click();
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Welcome back." })).toBeVisible();
}

test("synthetic visit from booking through clinician closure, with separated billing", async ({ page }) => {
  const nurse = page;
  await signIn(nurse, "usr_gh_nurse");
  const day = await selectOpenFollowUpSlot(nurse);
  await nurse.getByRole("button", { name: "Request appointment" }).click();
  await expect(nurse).toHaveURL(/\/appointments\/apt_/);
  const appointmentUrl = nurse.url();
  await nurse.getByRole("button", { name: "Confirm", exact: true }).click();
  await nurse.getByRole("button", { name: "Record arrival" }).click();
  await expect(nurse.getByText("arrived", { exact: true })).toBeVisible();
  await signOut(nurse);

  const doctor = page;
  await signIn(doctor, "usr_gh_doctor");
  await doctor.goto(appointmentUrl);
  await doctor.getByRole("button", { name: "Start encounter" }).click();
  await expect(doctor).toHaveURL(/\/encounters\/enc_/);
  const encounter = doctor.url().match(/encounters\/(enc_[^?]+)/)![1];
  await doctor.goto(`/clinical/vitals/new?patient=pat_gh_kofi_a&encounter=${encounter}`);
  await doctor.getByLabel("Measurement").selectOption("syn-bp");
  await doctor.getByLabel("Systolic, for blood pressure").fill("138");
  await doctor.getByLabel("Diastolic, for blood pressure").fill("86");
  await doctor.getByLabel("Effective time").fill(`${day}T09:05`);
  await doctor.getByRole("button", { name: "Save vital sign" }).click();
  await expect(doctor).toHaveURL(/clinical\/observations\/obs_/);
  const observation = doctor.url().match(/observations\/(obs_[^?]+)/)![1];
  await doctor.goto(`/patients/pat_gh_kofi_a/chart?encounter=${encounter}`);
  await expect(doctor.getByRole("heading", { name: "Kofi Mensah" })).toBeVisible();
  await expect(doctor.getByText("Blood pressure", { exact: false }).first()).toBeVisible();
  await expect(doctor.getByText("Amounts are hidden for this role.", { exact: false })).toBeVisible();
  await expect(doctor.getByRole("listitem").filter({ has: doctor.locator(`a[href="/clinical/history?kind=observation&id=${observation}"]`) })).toContainText("Systolic blood pressure: 138 mm[Hg]");
  expect((await new AxeBuilder({ page: doctor }).analyze()).violations).toEqual([]);
  await doctor.screenshot({ path: screenshotPath("P04-F05-chart-desktop.png"), fullPage: true });
  await doctor.setViewportSize({ width: 390, height: 844 });
  const identityPosition = await doctor.getByRole("heading", { name: "Kofi Mensah" }).boundingBox();
  expect(identityPosition!.y).toBeLessThan(400);
  expect(await doctor.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  expect((await new AxeBuilder({ page: doctor }).analyze()).violations).toEqual([]);
  await doctor.screenshot({ path: screenshotPath("P04-F05-chart-mobile.png"), fullPage: true });
  await doctor.goto(`/encounters/${encounter}/close`);
  await doctor.getByRole("button", { name: "Confirm closure" }).click();
  await expect(doctor.getByText("completed", { exact: true })).toBeVisible();
  await doctor.goto(`/clinical/vitals/new?patient=pat_gh_kofi_a&encounter=${encounter}`);
  await expect(doctor).toHaveURL(/error=source-closed/);
  await doctor.goto("/billing");
  await expect(doctor).toHaveURL(/access\/denied/);
  await signOut(doctor);

  const officer = page;
  await signIn(officer, "usr_gh_billing");
  await officer.goto(`/billing/charges/new?patient=pat_gh_kofi_a&encounter=${encounter}`);
  const submissionKey = await officer.locator('input[name="submissionKey"]').inputValue();
  await officer.getByRole("button", { name: "Save charge" }).click();
  await expect(officer).toHaveURL(/billing\/charges\/chg_/);
  await expect(officer.getByText("Total GHS 150.00")).toBeVisible();
  const chargeUrl = officer.url();
  const repeated = await officer.request.post("/api/billing/charges", { form: { patientId: "pat_gh_kofi_a", encounterId: encounter, catalogId: "cat_gh_consultation", quantity: "1", submissionKey }, maxRedirects: 0 });
  expect(repeated.status()).toBe(303);
  expect(new URL(repeated.headers().location).pathname).toBe(new URL(chargeUrl).pathname);
  await officer.getByRole("button", { name: "Mark reviewed" }).click();
  await officer.getByRole("button", { name: "Finalize locally" }).click();
  await expect(officer.getByText("finalized-local", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page: officer }).analyze()).violations).toEqual([]);
  await officer.screenshot({ path: screenshotPath("P04-F05-charge.png"), fullPage: true });
  await officer.goto(`/clinical?patient=pat_gh_kofi_a&encounter=${encounter}`);
  await expect(officer).toHaveURL(/access\/denied/);
  await signOut(officer);
});

test("chart denies a foreign tenant and shows an empty source record truthfully", async ({ page }) => {
  await signIn(page, "usr_gh_doctor");
  await page.goto("/patients/pat_gh_kofi_b/chart");
  await expect(page.getByText("No allergy entry is recorded.", { exact: false })).toBeVisible();
  await expect(page.getByText("No pending work is recorded for this patient.")).toBeVisible();
  await page.goto("/patients/pat_eu_kofi/chart");
  await expect(page.getByText("That patient chart is not available for this facility.", { exact: true })).toBeVisible();
});
