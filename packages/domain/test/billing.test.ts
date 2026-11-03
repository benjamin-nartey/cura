import "./fixture-clock.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyAccessLedger } from "../src/access-ledger.ts";
import { seedAuthorization } from "../src/authorization.ts";
import {
  adjustCharge,
  BILLING_ROLLBACK,
  billingSnapshot,
  chargeHistory,
  chargeStatus,
  createCharge,
  finalizeCharge,
  listBillingCatalog,
  readCharge,
  reviewCharge,
  setBillingDependency,
  transmitCharge,
  voidCharge,
} from "../src/billing.ts";
import { healthcheck } from "../src/chart.ts";
import { createDatabase, get, run } from "../src/db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/errors.ts";
import { arriveAppointment, closeVisitEncounter, confirmAppointment, requestAppointment, startVisitEncounter } from "../src/scheduling.ts";
import { seed } from "../src/seed.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";
import { readUnifiedChart } from "../src/patient-chart.ts";
import { submitOrder } from "../src/work.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";
process.env.CURASPHERE_ENV ??= "local";
process.env.CURASPHERE_DATA_CLASS ??= "synthetic";
process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE ??= "true";
const domainRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doctor = { userId: DEMO_GH.users.doctor, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f05_doctor" };
const nurse = { userId: DEMO_GH.users.nurse, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f05_nurse" };
const billing = { userId: "usr_gh_billing", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f05_billing" };
const admin = { userId: DEMO_GH.users.admin, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f05_admin" };
const reception = { userId: DEMO_GH.users.reception, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_p04f05_reception" };
const eu = { userId: DEMO_EU.users.doctor, organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, sessionId: "ses_p04f05_eu" };

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  seedAuthorization(database);
  return database;
}

function visit(database: ReturnType<typeof db>, key = "visit-bill", startsAt = "2026-11-10T09:00:00.000Z") {
  const endsAt = new Date(Date.parse(startsAt) + 20 * 60 * 1000).toISOString();
  const created = requestAppointment(database, nurse, {
    patientId: "pat_gh_kofi_a",
    practitionerId: "pr_gh_kwame",
    category: "follow-up",
    startsAt,
    endsAt,
    resourceId: "room_fac_gh_accra",
    idempotencyKey: key,
  });
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  return startVisitEncounter(database, doctor, created.id, 3, `${key}-start`);
}

test("P04-F05-S01 S02 S03 S05 S08 an authorized charge persists with catalog price", () => {
  const database = db();
  const opened = visit(database);
  const created = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-create-1" });
  assert.equal(created.status, "recorded");
  assert.equal(created.totalMinor, 15000);
  assert.equal(created.currency, "GHS");
  const row = readCharge(database, billing, created.id);
  assert.equal(row.patient_id, "pat_gh_kofi_a");
  assert.equal(row.encounter_id, opened.id);
  assert.equal(row.items[0]?.catalog_version, 1);
  assert.equal(row.items[0]?.unit_price_minor, 15000);
  database.close();
});

test("P04-F05-S04 invalid encounter relationship is rejected", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => createCharge(database, billing, { patientId: "pat_gh_kofi_b", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-wrong-patient" }), ConflictError);
  database.close();
});

test("P04-F05-S06 S07 invalid currency quantity and amount are rejected", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 0, idempotencyKey: "bill-qty" }), ValidationError);
  const created = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-adj-base" });
  const item = readCharge(database, billing, created.id).items[0]!;
  assert.throws(() => adjustCharge(database, billing, created.id, { expectedVersion: 1, itemId: item.id, amountMinor: -1, reason: "price-correction", idempotencyKey: "bill-neg" }), ValidationError);
  database.close();
});

test("P04-F05-S09 duplicate charge request is idempotent", () => {
  const database = db();
  const opened = visit(database);
  const first = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-idem" });
  const second = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-idem" });
  assert.equal(first.id, second.id);
  assert.equal(second.idempotent, true);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM billing_charges`)?.c, 1);
  database.close();
});

test("P04-F05-S10 concurrent duplicate submission produces one charge", async () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cura-bill-"));
  const file = path.join(dir, "chart.sqlite");
  const database = createDatabase(file);
  seed(database);
  seedDemoTenants(database);
  seedAuthorization(database);
  const opened = visit(database, "visit-race-bill", "2026-11-10T10:00:00.000Z");
  database.close();
  const race = () =>
    new Promise<number | null>((resolve) => {
      const child = spawn(process.execPath, ["--import", "tsx", path.join(domainRoot, "test", "billing-racer.ts"), file, billing.userId, "bill-race-key", opened.id], { cwd: domainRoot });
      child.on("close", (status) => resolve(status));
    });
  const codes = (await Promise.all([race(), race()])).sort();
  assert.deepEqual(codes, [0, 0]);
  const check = createDatabase(file);
  assert.equal(get<{ c: number }>(check, `SELECT COUNT(*) AS c FROM billing_charges`)?.c, 1);
  assert.equal(get<{ c: number }>(check, `SELECT COUNT(*) AS c FROM billing_versions WHERE record_kind = 'charge'`)?.c, 1);
  check.close();
});

test("P04-F05-S11 S12 S13 adjustment preserves history and rejects stale version", () => {
  const database = db();
  const opened = visit(database);
  const created = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-adj" });
  const item = readCharge(database, billing, created.id).items[0]!;
  const adjusted = adjustCharge(database, billing, created.id, { expectedVersion: 1, itemId: item.id, amountMinor: 12000, reason: "price-correction", idempotencyKey: "bill-adj-ok" });
  assert.equal(adjusted.totalMinor, 12000);
  const history = chargeHistory(database, billing, created.id);
  assert.equal(history[0]?.snapshot.totalMinor, 15000);
  assert.equal(history[1]?.snapshot.totalMinor, 12000);
  assert.throws(() => adjustCharge(database, billing, created.id, { expectedVersion: 1, itemId: item.id, amountMinor: 10000, reason: "price-correction", idempotencyKey: "bill-adj-stale" }), ConflictError);
  database.close();
});

test("P04-F05-S14 S43 S44 unauthorized adjustment and admin billing read are denied", () => {
  const database = db();
  const opened = visit(database);
  const created = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-deny" });
  const item = readCharge(database, billing, created.id).items[0]!;
  assert.throws(() => adjustCharge(database, doctor, created.id, { expectedVersion: 1, itemId: item.id, amountMinor: 10000, reason: "price-correction", idempotencyKey: "bill-doc-adj" }), ForbiddenError);
  assert.throws(() => readCharge(database, admin, created.id), ForbiddenError);
  assert.equal(get<{ decision: string }>(database, `SELECT decision FROM authorization_decisions WHERE principal_id = ? AND action = 'billing.charge.read' ORDER BY rowid DESC LIMIT 1`, admin.userId)?.decision, "deny");
  assert.throws(() => listBillingCatalog(database, reception), ForbiddenError);
  const status = chargeStatus(database, doctor, "pat_gh_kofi_a");
  assert.equal(status.counts.open >= 1, true);
  database.close();
});

test("P04-F05-S15 S16 void preserves history and rejects invalid transition", () => {
  const database = db();
  const opened = visit(database);
  const created = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-void" });
  reviewCharge(database, billing, created.id, { expectedVersion: 1, idempotencyKey: "bill-review" });
  finalizeCharge(database, billing, created.id, { expectedVersion: 2, idempotencyKey: "bill-final" });
  assert.throws(() => reviewCharge(database, billing, created.id, { expectedVersion: 3, idempotencyKey: "bill-bad-trans" }), ConflictError);
  const voided = voidCharge(database, billing, created.id, { expectedVersion: 3, reason: "no-longer-needed", idempotencyKey: "bill-void-ok" });
  assert.equal(voided.status, "voided");
  assert.equal(chargeHistory(database, billing, created.id)[0]?.snapshot.status, "recorded");
  database.close();
});

test("P04-F05-S17 no payment transmission", () => {
  const database = db();
  assert.throws(() => transmitCharge(database, billing), ForbiddenError);
  assert.equal(billingSnapshot(database, billing, { traceId: "bill-trace" }).transmitted, 0);
  database.close();
});

test("P04-F05-S18 S21 S32 chart status and tenant isolation", () => {
  const database = db();
  const opened = visit(database);
  createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-iso" });
  assert.throws(() => createCharge(database, eu, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-eu" }), ForbiddenError);
  assert.throws(() => readCharge(database, eu, get<{ id: string }>(database, `SELECT id FROM billing_charges`)!.id), ForbiddenError);
  database.close();
});

test("P04-F05-S35 S36 S48 audit evidence and ledger intact", () => {
  const database = db();
  const opened = visit(database);
  createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-audit" });
  assert.equal(verifyAccessLedger(database, DEMO_GH.organizationId).intact, true);
  database.close();
});

test("P04-F05-S45 S46 S47 S49 outage restart migration rollback", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "cura-billing-rollback-")), "chart.sqlite");
  const database = createDatabase(file);
  seed(database);
  seedDemoTenants(database);
  const opened = visit(database);
  setBillingDependency(database, "unavailable");
  assert.throws(() => createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-down" }), ConflictError);
  setBillingDependency(database, "available");
  const created = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-up-again" });
  assert.equal(healthcheck(database).schemaVersion, 43);
  database.exec(BILLING_ROLLBACK);
  assert.equal(healthcheck(database).schemaVersion, 41);
  assert.equal(get(database, `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'billing_charges'`), undefined);
  const patientCount = get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM patients`)!.c;
  database.close();
  const restored = createDatabase(file);
  seedDemoTenants(restored);
  assert.equal(healthcheck(restored).schemaVersion, 43);
  assert.equal(get<{ c: number }>(restored, `SELECT COUNT(*) AS c FROM patients`)!.c, patientCount);
  assert.equal(get<{ id: string }>(restored, `SELECT id FROM visit_encounters WHERE id = ?`, opened.id)?.id, opened.id);
  assert.equal(get(restored, `SELECT id FROM billing_charges WHERE id = ?`, created.id), undefined);
  restored.close();
});

test("P04-F05-S41 clinical signing remains denied and closed encounter still bills", () => {
  const database = db();
  const opened = visit(database);
  closeVisitEncounter(database, doctor, opened.id, 1, "visit-complete");
  const created = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "bill-closed" });
  assert.equal(created.status, "recorded");
  database.close();
});

test("P04-F05-S50 chart pending work belongs only to the selected patient", () => {
  const database = db();
  const opened = visit(database);
  const order = submitOrder(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-cbc", departmentId: "dep_gh_madina_lab", priority: "routine", dueOn: "2026-11-10", idempotencyKey: "chart-pending-order" });
  const own = readUnifiedChart(database, doctor, "pat_gh_kofi_a", opened.id);
  const other = readUnifiedChart(database, doctor, "pat_gh_kofi_b", opened.id);
  assert.equal((own.sections.pending as { orders: { id: string }[] }).orders[0]?.id, order.id);
  assert.deepEqual(other.sections.pending, { orders: [], tasks: [], referrals: [], plans: [] });
  assert.equal(other.encounter, null);
  setBillingDependency(database, "unavailable");
  const partial = readUnifiedChart(database, doctor, "pat_gh_kofi_a");
  assert.ok(partial.failures?.includes("billingStatus"));
  assert.ok(Array.isArray(partial.sections.observations));
  database.close();
});

test("P04-F05-S51 cached financial mutations cannot cross facilities", () => {
  const database = db();
  const opened = visit(database);
  const created = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "scope-create" });
  const input = { expectedVersion: 1, idempotencyKey: "scope-review" };
  reviewCharge(database, billing, created.id, input);
  run(database, `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version) VALUES ('fm_billing_east', ?, ?, ?, 'billing-officer', 'active', 1)`, billing.organizationId, DEMO_GH.facilities.eastLegon.id, billing.userId);
  seedAuthorization(database);
  const other = { ...billing, facilityId: DEMO_GH.facilities.eastLegon.id };
  assert.throws(() => reviewCharge(database, other, created.id, input), NotFoundError);
  assert.equal(reviewCharge(database, billing, created.id, input).idempotent, true);
  assert.equal(billingSnapshot(database, billing).created, 1);
  assert.equal(billingSnapshot(database, other).created, 0);
  database.close();
});

test("P04-F05-S52 catalog dates and protected environments fail closed", () => {
  const database = db();
  const opened = visit(database);
  const input = { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "catalog-date" };
  run(database, `UPDATE billing_catalog SET expires_on = '2026-10-18' WHERE id = ?`, input.catalogId);
  assert.throws(() => createCharge(database, billing, input), ConflictError);
  run(database, `UPDATE billing_catalog SET expires_on = NULL, effective_on = '2026-10-20' WHERE id = ?`, input.catalogId);
  assert.throws(() => createCharge(database, billing, input), ConflictError);
  const prior = process.env.CURASPHERE_ENV;
  try {
    for (const env of ["production", "staging"]) {
      process.env.CURASPHERE_ENV = env;
      assert.throws(() => chargeStatus(database, doctor, input.patientId), ForbiddenError);
      assert.throws(() => readUnifiedChart(database, doctor, input.patientId), ForbiddenError);
    }
  } finally {
    if (prior === undefined) delete process.env.CURASPHERE_ENV;
    else process.env.CURASPHERE_ENV = prior;
  }
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM billing_charges`)?.c, 0);
  database.close();
});

test("P04-F05-S53 database rejects invalid amounts, cross-tenant links and mutable adjustments", () => {
  const database = db();
  const opened = visit(database);
  const charge = createCharge(database, billing, { patientId: "pat_gh_kofi_a", encounterId: opened.id, catalogId: "cat_gh_consultation", quantity: 1, idempotencyKey: "integrity-charge" });
  assert.throws(() => run(database, `UPDATE billing_charges SET total_minor = -1 WHERE id = ?`, charge.id), /invalid billing charge/);
  assert.throws(() => run(database, `UPDATE billing_charges SET patient_id = 'pat_eu_aoife' WHERE id = ?`, charge.id), /invalid billing charge/);
  const item = readCharge(database, billing, charge.id).items[0]!;
  assert.throws(() => run(database, `UPDATE billing_charge_items SET currency = 'EUR' WHERE id = ?`, item.id), /invalid billing item/);
  adjustCharge(database, billing, charge.id, { expectedVersion: 1, itemId: item.id, amountMinor: 12000, reason: "price-correction", idempotencyKey: "integrity-adjust" });
  assert.throws(() => run(database, `DELETE FROM billing_adjustments WHERE charge_id = ?`, charge.id), /immutable/);
  assert.equal(readCharge(database, billing, charge.id).total_minor, 12000);
  database.close();
});

test("P04-F05-S54 failed additive migration rolls back its marker and can recover", () => {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "cura-billing-upgrade-")), "chart.sqlite");
  const database = createDatabase(file);
  database.exec(`DELETE FROM schema_migrations WHERE version = 43;
    DROP TRIGGER billing_charge_integrity_insert;
    DROP TRIGGER billing_charge_integrity_update;
    ALTER TABLE billing_charges RENAME TO billing_charges_recovery;`);
  database.close();
  assert.throws(() => createDatabase(file), /no such table/);
  // Open without migrations to restore the deliberately damaged synthetic prerequisite.
  const repair = new DatabaseSync(file);
  assert.equal(get(repair, `SELECT version FROM schema_migrations WHERE version = 43`), undefined);
  repair.exec(`ALTER TABLE billing_charges_recovery RENAME TO billing_charges`);
  repair.close();
  const recovered = createDatabase(file);
  assert.equal(healthcheck(recovered).schemaVersion, 43);
  recovered.close();
});
