import { CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK } from "../src/code-system-schema.ts";
import "./fixture-clock.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyAccessLedger } from "../src/access-ledger.ts";
import { seedAuthorization } from "../src/authorization.ts";
import { healthcheck } from "../src/chart.ts";
import { activateConsent, createConsent, PRIVACY_OFFICER, SUBJECT_AKUA, verifyAuthority, withdrawConsent } from "../src/consent.ts";
import { createDatabase, get, run } from "../src/db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/errors.ts";
import { recordMedicationDraft } from "../src/clinical-source.ts";
import { arriveAppointment, closeVisitEncounter, confirmAppointment, requestAppointment, startVisitEncounter } from "../src/scheduling.ts";
import { seed } from "../src/seed.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";
import {
  addAttachment,
  assignTask,
  cancelOrder,
  decideWorkReferral,
  listPending,
  readOrder,
  recordPlan,
  routeOrder,
  setWorkDependency,
  submitOrder,
  submitReferral,
  transmitWorkOrder,
  updatePlan,
  WORK_ROLLBACK,
  workHistory,
  workSnapshot,
} from "../src/work.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";
process.env.CURASPHERE_ENV ??= "local";
process.env.CURASPHERE_DATA_CLASS ??= "synthetic";
process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE ??= "true";

const domainRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doctor = { userId: DEMO_GH.users.doctor, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f04_doctor" };
const nurse = { userId: DEMO_GH.users.nurse, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f04_nurse" };
const east = { userId: DEMO_GH.users.nurse, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_p04f04_east" };
const lab = { userId: DEMO_GH.users.laboratory, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.madina.id, sessionId: "ses_p04f04_lab" };
const admin = { userId: DEMO_GH.users.admin, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f04_admin" };
const reception = { userId: DEMO_GH.users.reception, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_p04f04_reception" };
const officer = { userId: PRIVACY_OFFICER, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f04_privacy" };
const revoked = { userId: "usr_gh_invite", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f04_revoked" };
const eu = { userId: DEMO_EU.users.doctor, organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, sessionId: "ses_p04f04_eu" };

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  return database;
}

function fileDb() {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "cura-work-")), "chart.sqlite");
  const database = createDatabase(file);
  seed(database);
  seedDemoTenants(database);
  return { database, file };
}

function visit(database: ReturnType<typeof db>, key = "visit-kofi-work", startsAt = "2026-10-22T09:00:00.000Z") {
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

function order(database: ReturnType<typeof db>, encounterId: string, key = "order-cbc-kofi") {
  return submitOrder(database, doctor, {
    patientId: "pat_gh_kofi_a",
    encounterId,
    practitionerId: "pr_gh_kwame",
    code: "syn-cbc",
    departmentId: "dep_gh_madina_lab",
    priority: "routine",
    dueOn: "2026-10-22",
    idempotencyKey: key,
  });
}

test("P04-F04-S01 an authorized order persists once", () => {
  const database = db();
  const opened = visit(database);
  const created = order(database, opened.id);
  const again = order(database, opened.id);
  assert.equal(created.id, again.id);
  assert.equal(again.idempotent, true);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM work_orders`)?.c, 1);
  assert.equal(get<{ fulfillment: string }>(database, `SELECT fulfillment FROM work_orders WHERE id = ?`, created.id)?.fulfillment, "not-transmitted");
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM lab_orders`)?.c, get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM lab_orders WHERE id NOT LIKE 'ord_%'`)?.c);
  database.close();
});

test("P04-F04-S02 a repeated submission with another body is rejected", () => {
  const database = db();
  const opened = visit(database);
  order(database, opened.id, "order-same-key");
  assert.throws(() => submitOrder(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-cxr", departmentId: "dep_gh_madina_imaging", priority: "routine", dueOn: "2026-10-22", idempotencyKey: "order-same-key" }), ConflictError);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM work_orders`)?.c, 1);
  database.close();
});

test("P04-F04-S03 concurrent submissions create one logical order", async () => {
  const { database, file } = fileDb();
  const opened = visit(database, "visit-work-race", "2026-10-22T10:00:00.000Z");
  database.close();
  const race = () => new Promise<number | null>((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", path.join(domainRoot, "test", "work-racer.ts"), file, doctor.userId, "order-race-key", opened.id], { cwd: domainRoot });
    child.on("close", (status) => resolve(status));
  });
  const codes = (await Promise.all([race(), race()])).sort();
  assert.deepEqual(codes, [0, 0]);
  const check = createDatabase(file);
  assert.equal(get<{ c: number }>(check, `SELECT COUNT(*) AS c FROM work_orders`)?.c, 1);
  assert.equal(get<{ c: number }>(check, `SELECT COUNT(*) AS c FROM work_versions WHERE record_kind = 'order'`)?.c, 1);
  check.close();
});

test("P04-F04-S04 a missing patient and a bad encounter are rejected", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => submitOrder(database, doctor, { patientId: "pat_missing", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-cbc", departmentId: "dep_gh_madina_lab", priority: "routine", dueOn: "2026-10-22", idempotencyKey: "order-missing" }), NotFoundError);
  assert.throws(() => submitOrder(database, doctor, { patientId: "pat_gh_kofi_b", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-cbc", departmentId: "dep_gh_madina_lab", priority: "routine", dueOn: "2026-10-22", idempotencyKey: "order-wrong" }), ConflictError);
  database.close();
});

test("P04-F04-S05 a closed encounter rejects a new order and keeps cancellation available", () => {
  const database = db();
  const opened = visit(database);
  const created = order(database, opened.id, "order-before-close");
  closeVisitEncounter(database, doctor, opened.id, 1, "visit-complete");
  assert.throws(() => order(database, opened.id, "order-after-close"), ConflictError);
  const cancelled = cancelOrder(database, doctor, created.id, { expectedVersion: 1, reason: "no-longer-needed", idempotencyKey: "order-cancel-closed" });
  assert.equal(cancelled.status, "cancelled");
  const history = workHistory(database, doctor, "order", created.id);
  assert.equal(history[0]?.snapshot.status, "submitted");
  assert.equal(history[1]?.snapshot.status, "cancelled");
  database.close();
});

test("P04-F04-S06 an invalid transition and a stale route are rejected", () => {
  const database = db();
  const opened = visit(database);
  const created = order(database, opened.id, "order-route");
  routeOrder(database, lab, created.id, { expectedVersion: 1, idempotencyKey: "order-route-ok" });
  assert.throws(() => routeOrder(database, lab, created.id, { expectedVersion: 1, idempotencyKey: "order-route-stale" }), ConflictError);
  assert.throws(() => cancelOrder(database, doctor, created.id, { expectedVersion: 2, reason: "no-longer-needed", idempotencyKey: "order-cancel-twice" }) && cancelOrder(database, doctor, created.id, { expectedVersion: 3, reason: "no-longer-needed", idempotencyKey: "order-cancel-again" }), ConflictError);
  database.close();
});

test("P04-F04-S07 pending work is visible only to the authorized facilities", () => {
  const database = db();
  const opened = visit(database);
  order(database, opened.id, "order-pending");
  const origin = listPending(database, doctor);
  const destination = listPending(database, lab);
  const elsewhere = listPending(database, east);
  assert.equal(origin.orders.length, 1);
  assert.equal(destination.orders.length, 1);
  assert.equal(destination.tasks.length, 1);
  assert.equal(elsewhere.orders.length, 0);
  assert.equal(elsewhere.tasks.length, 0);
  assert.throws(() => listPending(database, reception), ForbiddenError);
  assert.throws(() => listPending(database, admin), ForbiddenError);
  database.close();
});

test("P04-F04-S08 a destination assignee can take the open task", () => {
  const database = db();
  const opened = visit(database);
  const created = order(database, opened.id, "order-task");
  const taskId = get<{ id: string }>(database, `SELECT id FROM work_tasks WHERE parent_id = ?`, created.id)?.id;
  assert.ok(taskId);
  const assigned = assignTask(database, lab, taskId, { expectedVersion: 1, assigneeUserId: DEMO_GH.users.laboratory, idempotencyKey: "task-assign-lab" });
  assert.equal(assigned.status, "assigned");
  assert.throws(() => assignTask(database, nurse, taskId, { expectedVersion: 2, assigneeUserId: DEMO_GH.users.nurse, idempotencyKey: "task-assign-wrong" }), NotFoundError);
  database.close();
});

test("P04-F04-S09 a care plan keeps its owner and due date", () => {
  const database = db();
  const opened = visit(database);
  const created = recordPlan(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-follow-up-plan", ownerUserId: DEMO_GH.users.nurse, dueOn: "2026-10-29", idempotencyKey: "plan-follow" });
  const again = recordPlan(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-follow-up-plan", ownerUserId: DEMO_GH.users.nurse, dueOn: "2026-10-29", idempotencyKey: "plan-follow" });
  assert.equal(created.id, again.id);
  const pending = listPending(database, nurse);
  assert.equal(pending.plans.length, 1);
  updatePlan(database, doctor, created.id, { expectedVersion: 1, status: "completed", reason: "completed", idempotencyKey: "plan-done" });
  assert.equal(listPending(database, nurse).plans.length, 0);
  assert.throws(() => updatePlan(database, doctor, created.id, { expectedVersion: 2, status: "active", reason: "completed", idempotencyKey: "plan-reopen" }), ValidationError);
  database.close();
});

test("P04-F04-S10 a referral is decided only at the destination", () => {
  const database = db();
  const opened = visit(database);
  const created = submitReferral(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-diagnostic-review", toFacilityId: DEMO_GH.facilities.madina.id, dueOn: "2026-10-28", idempotencyKey: "ref-madina" });
  assert.equal(listPending(database, lab).referrals.length, 1);
  assert.throws(() => decideWorkReferral(database, doctor, created.id, { expectedVersion: 1, decision: "accepted", idempotencyKey: "ref-doctor-decide" }), ForbiddenError);
  const decided = decideWorkReferral(database, lab, created.id, { expectedVersion: 1, decision: "accepted", idempotencyKey: "ref-lab-decide" });
  assert.equal(decided.status, "accepted");
  assert.equal(listPending(database, lab).referrals.length, 0);
  const history = workHistory(database, lab, "referral", created.id);
  assert.equal(history.length, 2);
  database.close();
});

test("P04-F04-S11 an attachment stores metadata and transmission stays denied", () => {
  const database = db();
  const opened = visit(database);
  const created = order(database, opened.id, "order-file");
  const saved = addAttachment(database, doctor, { parentKind: "order", parentId: created.id, code: "syn-request-note", byteLength: 128, sha256: "ab".repeat(32), idempotencyKey: "att-note" });
  assert.equal(saved.id.startsWith("att_"), true);
  assert.equal(get<{ byte_length: number }>(database, `SELECT byte_length FROM work_attachments WHERE id = ?`, saved.id)?.byte_length, 128);
  assert.throws(() => transmitWorkOrder(database, doctor), ForbiddenError);
  assert.equal(workSnapshot({ display: "Kofi", value: "38.1", traceId: "trace-1" }).trace, "trace-1");
  assert.equal(JSON.stringify(workSnapshot({ display: "Kofi", value: "38.1" })).includes("Kofi"), false);
  database.close();
});

test("P04-F04-S12 unauthorized and cross-tenant access is denied", () => {
  const database = db();
  const opened = visit(database);
  const created = order(database, opened.id, "order-guard");
  assert.throws(() => submitOrder(database, nurse, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-cbc", departmentId: "dep_gh_madina_lab", priority: "routine", dueOn: "2026-10-22", idempotencyKey: "order-nurse" }), ForbiddenError);
  assert.throws(() => submitOrder(database, revoked, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-cbc", departmentId: "dep_gh_madina_lab", priority: "routine", dueOn: "2026-10-22", idempotencyKey: "order-revoked" }), ForbiddenError);
  assert.throws(() => readOrder(database, eu, created.id), NotFoundError);
  assert.throws(() => submitOrder(database, doctor, { patientId: "pat_eu_kofi", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-cbc", departmentId: "dep_gh_madina_lab", priority: "routine", dueOn: "2026-10-22", idempotencyKey: "order-eu" }), NotFoundError);
  database.close();
});

test("P04-F04-S13 an auditor can read pending work and cannot submit", () => {
  const database = db();
  const opened = visit(database);
  order(database, opened.id, "order-audit");
  run(database, `INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_work_auditor', 'org_demo_gh', 'fac_gh_accra', 'Synthetic Auditor', 'auditor')`);
  run(database, `INSERT INTO organization_memberships (id, organization_id, user_id, status, version) VALUES ('om_work_auditor', 'org_demo_gh', 'usr_work_auditor', 'active', 1)`);
  run(database, `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version) VALUES ('fm_work_auditor', 'org_demo_gh', 'fac_gh_accra', 'usr_work_auditor', 'auditor', 'active', 1)`);
  seedAuthorization(database);
  const auditor = { userId: "usr_work_auditor", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f04_auditor" };
  assert.equal(listPending(database, auditor).orders.length, 1);
  assert.throws(() => submitOrder(database, auditor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-cbc", departmentId: "dep_gh_madina_lab", priority: "routine", dueOn: "2026-10-22", idempotencyKey: "order-auditor-write" }), ForbiddenError);
  assert.equal(verifyAccessLedger(database, doctor.organizationId).intact, true);
  database.close();
});

test("P04-F04-S14 consent withdrawal stays withdrawn and no AI service is used", () => {
  const database = db();
  const consent = createConsent(database, officer, { subjectId: SUBJECT_AKUA, authorityId: "auth_akua_self", purpose: "COMMUNICATION", action: "consent.communication.dispatch", resourceCategory: "appointment-reminder", recipient: "facility-messenger", effectiveAt: "2026-10-14T00:00:00.000Z", expiresAt: "2027-10-14T00:00:00.000Z", decision: "granted", idempotencyKey: "consent-work-14" });
  verifyAuthority(database, officer, "auth_akua_self", "evidence_self_ack");
  const active = activateConsent(database, officer, consent.id, consent.version);
  withdrawConsent(database, officer, active.id, active.version, "withdraw-work-14");
  const opened = visit(database, "visit-consent-work", "2026-10-22T10:40:00.000Z");
  order(database, opened.id, "order-consent");
  assert.equal(get<{ status: string }>(database, `SELECT status FROM consent_directives WHERE id = ?`, active.id)?.status, "withdrawn");
  const source = readFileSync(new URL("../src/work.ts", import.meta.url), "utf8");
  assert.equal(source.includes("invokeGateway"), false);
  assert.equal(source.includes("openai"), false);
  database.close();
});

test("P04-F04-S15 a dependency outage and a failed transaction leave no partial order", () => {
  const database = db();
  const opened = visit(database);
  setWorkDependency(database, "unavailable");
  assert.throws(() => order(database, opened.id, "order-down"), ConflictError);
  setWorkDependency(database, "available");
  database.exec(`CREATE TRIGGER work_fail BEFORE INSERT ON work_versions BEGIN SELECT RAISE(ABORT, 'forced'); END`);
  assert.throws(() => order(database, opened.id, "order-fail"));
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM work_orders`)?.c, 0);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM work_tasks`)?.c, 0);
  database.close();
});

test("P04-F04-S16 restart and rollback preserve the schema head", () => {
  const { database, file } = fileDb();
  const opened = visit(database, "visit-work-restart", "2026-10-22T11:00:00.000Z");
  const created = order(database, opened.id, "order-restart");
  const draft = recordMedicationDraft(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-paracetamol", dose: 500, idempotencyKey: "med-still-draft" });
  database.close();
  const reopened = createDatabase(file);
  assert.equal(get<{ status: string }>(reopened, `SELECT status FROM work_orders WHERE id = ?`, created.id)?.status, "submitted");
  assert.equal(get<{ executable: number }>(reopened, `SELECT executable FROM source_medication_orders WHERE id = ?`, draft.id)?.executable, 0);
  assert.equal(healthcheck(reopened).schemaVersion, 63);
  reopened.exec(CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK);
  reopened.exec(WORK_ROLLBACK);
  reopened.close();
  const restored = createDatabase(file);
  assert.equal(healthcheck(restored).schemaVersion, 63);
  assert.equal(get<{ name: string }>(restored, `SELECT name FROM sqlite_master WHERE name = 'work_orders'`)?.name, "work_orders");
  restored.close();
});

test("P04-F04-S17 a merged patient keeps the original order attribution", () => {
  const database = db();
  const booked = requestAppointment(database, nurse, { patientId: "pat_gh_kofi_b", practitionerId: "pr_gh_kwame", category: "follow-up", startsAt: "2026-10-22T11:40:00.000Z", endsAt: "2026-10-22T12:00:00.000Z", resourceId: "room_fac_gh_accra", idempotencyKey: "visit-kofi-b-work" });
  confirmAppointment(database, nurse, booked.id, 1);
  arriveAppointment(database, nurse, booked.id, 2);
  const opened = startVisitEncounter(database, doctor, booked.id, 3, "visit-kofi-b-start");
  const created = submitOrder(database, doctor, { patientId: "pat_gh_kofi_b", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-nursing-review", departmentId: "dep_gh_accra_nursing", priority: "routine", dueOn: "2026-10-22", idempotencyKey: "order-kofi-b" });
  run(database, `UPDATE patients SET registration_status = 'merged', merged_into_id = 'pat_gh_kofi_a' WHERE id = 'pat_gh_kofi_b'`);
  assert.equal(get<{ patient_id: string }>(database, `SELECT patient_id FROM work_orders WHERE id = ?`, created.id)?.patient_id, "pat_gh_kofi_b");
  assert.throws(() => submitOrder(database, doctor, { patientId: "pat_gh_kofi_b", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-nursing-review", departmentId: "dep_gh_accra_nursing", priority: "urgent", dueOn: "2026-10-23", idempotencyKey: "order-merged" }), ValidationError);
  database.close();
});
