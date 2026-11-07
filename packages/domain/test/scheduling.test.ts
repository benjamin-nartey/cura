import { CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK } from "../src/code-system-schema.ts";
import "./fixture-clock.ts";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { verifyAccessLedger } from "../src/access-ledger.ts";
import { seedAuthorization } from "../src/authorization.ts";
import { healthcheck } from "../src/chart.ts";
import { activateConsent, createConsent, PRIVACY_OFFICER, SUBJECT_AKUA, verifyAuthority, withdrawConsent } from "../src/consent.ts";
import { createDatabase, get } from "../src/db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/errors.ts";
import { linkVerifiedSubject } from "../src/master-records.ts";
import {
  arriveAppointment,
  cancelAppointment,
  closeVisitEncounter,
  confirmAppointment,
  listSlots,
  localToUtc,
  nextOpenSlot,
  noShowAppointment,
  queueAppointmentReminder,
  readAppointment,
  readVisitEncounter,
  requestAppointment,
  rescheduleAppointment,
  SCHEDULE_ROLLBACK,
  schedulingSnapshot,
  setSchedulingDependency,
  startVisitEncounter,
} from "../src/scheduling.ts";
import { seed } from "../src/seed.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";

const START = "2026-10-20T09:00:00.000Z";
const END = "2026-10-20T09:20:00.000Z";
const LATER = "2026-10-20T10:00:00.000Z";
const LATER_END = "2026-10-20T10:20:00.000Z";
const ROOM = "room_fac_gh_accra";

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  return database;
}

const domainRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function fileDb() {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "cura-schedule-")), "chart.sqlite");
  const database = createDatabase(file);
  seed(database);
  seedDemoTenants(database);
  return { database, file };
}

const nurse = { userId: DEMO_GH.users.nurse, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f02_nurse" };
const transfer = { userId: "usr_gh_transfer", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f02_transfer" };
const doctor = { userId: DEMO_GH.users.doctor, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f02_doctor" };
const admin = { userId: DEMO_GH.users.admin, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f02_admin" };
const reception = { userId: DEMO_GH.users.reception, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_p04f02_reception" };
const eu = { userId: DEMO_EU.users.admin, organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, sessionId: "ses_p04f02_eu" };
const officer = { userId: PRIVACY_OFFICER, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f02_privacy" };

function book(
  database: ReturnType<typeof db>,
  actor: { userId: string; organizationId: string; facilityId: string; sessionId: string } = nurse,
  key = "book-kofi-0900",
  startsAt = START,
  endsAt = END,
) {
  return requestAppointment(database, actor, {
    patientId: "pat_gh_kofi_a",
    practitionerId: "pr_gh_kwame",
    category: "follow-up",
    startsAt,
    endsAt,
    resourceId: ROOM,
    idempotencyKey: key,
  });
}

function secondClinician(database: ReturnType<typeof db>) {
  database.prepare(`INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_gh_doctor2', ?, ?, 'Ama Clinician', 'clinician')`).run(DEMO_GH.organizationId, DEMO_GH.facilities.accra.id);
  database.prepare(`INSERT INTO organization_memberships (id, organization_id, user_id, status, version) VALUES ('om_doc2', ?, 'usr_gh_doctor2', 'active', 1)`).run(DEMO_GH.organizationId);
  database.prepare(`INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version) VALUES ('fm_doc2', ?, ?, 'usr_gh_doctor2', 'doctor', 'active', 1)`).run(DEMO_GH.organizationId, DEMO_GH.facilities.accra.id);
  seedAuthorization(database);
  return { userId: "usr_gh_doctor2", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f02_doctor2" };
}

function race(file: string, op: string, actorId: string, key: string, extra = "") {
  return new Promise<{ status: number | null; stderr: string }>((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", path.join(domainRoot, "test", "schedule-racer.ts"), file, op, actorId, key, extra], { cwd: domainRoot });
    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("close", (status) => resolve({ status, stderr }));
  });
}

test("P04-F02-S01 an authorized appointment request succeeds", () => {
  const database = db();
  const created = book(database);
  assert.equal(created.status, "requested");
  const row = get<{ patient_id: string; practitioner_id: string; facility_id: string }>(database, `SELECT patient_id, practitioner_id, facility_id FROM appointments WHERE id = ?`, created.id);
  assert.equal(row?.patient_id, "pat_gh_kofi_a");
  assert.equal(row?.practitioner_id, "pr_gh_kwame");
  assert.equal(row?.facility_id, DEMO_GH.facilities.accra.id);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM scheduling_reservations WHERE appointment_id = ? AND status = 'held'`, created.id)?.c, 1);
  database.close();
});

test("P04-F02-S02 an invalid time interval is rejected", () => {
  const database = db();
  assert.throws(() => book(database, nurse, "book-bad-time", END, START), ValidationError);
  database.close();
});

test("P04-F02-S03 a nonexistent patient is rejected", () => {
  const database = db();
  assert.throws(() => requestAppointment(database, nurse, { patientId: "pat_missing", practitionerId: "pr_gh_kwame", category: "follow-up", startsAt: START, endsAt: END, resourceId: ROOM, idempotencyKey: "book-missing" }), NotFoundError);
  database.close();
});

test("P04-F02-S04 a retired patient reference is rejected", () => {
  const database = db();
  database.prepare(`UPDATE patients SET registration_status = 'merged', merged_into_id = 'pat_gh_kofi_a' WHERE id = 'pat_gh_kofi_b'`).run();
  assert.throws(() => requestAppointment(database, nurse, { patientId: "pat_gh_kofi_b", practitionerId: "pr_gh_kwame", category: "follow-up", startsAt: START, endsAt: END, resourceId: ROOM, idempotencyKey: "book-retired" }), ValidationError);
  assert.equal(get<{ patient_id: string }>(database, `SELECT id AS patient_id FROM patients WHERE id = 'pat_gh_kofi_b'`)?.patient_id, "pat_gh_kofi_b");
  database.close();
});

test("P04-F02-S05 an invalid practitioner affiliation is rejected", () => {
  const database = db();
  database.prepare(`UPDATE practitioner_affiliations SET status = 'inactive' WHERE practitioner_id = 'pr_gh_kwame'`).run();
  assert.throws(() => book(database, nurse, "book-unaffiliated"), ValidationError);
  database.close();
});

test("P04-F02-S06 an inactive practitioner cannot be booked", () => {
  const database = db();
  assert.throws(() => requestAppointment(database, nurse, { patientId: "pat_gh_kofi_a", practitionerId: "pr_gh_visitor", category: "follow-up", startsAt: START, endsAt: END, resourceId: ROOM, idempotencyKey: "book-inactive" }), ConflictError);
  database.close();
});

test("P04-F02-S07 a requested appointment is confirmed", () => {
  const database = db();
  const created = book(database);
  const confirmed = confirmAppointment(database, nurse, created.id, created.version);
  assert.equal(confirmed.status, "confirmed");
  assert.equal(get<{ status: string }>(database, `SELECT status FROM scheduling_reservations WHERE appointment_id = ?`, created.id)?.status, "active");
  database.close();
});

test("P04-F02-S08 appointment arrival is recorded", () => {
  const database = db();
  const created = book(database);
  const confirmed = confirmAppointment(database, nurse, created.id, 1);
  const arrived = arriveAppointment(database, nurse, created.id, confirmed.version);
  assert.equal(arrived.status, "arrived");
  assert.ok(arrived.arrivedAt);
  database.close();
});

test("P04-F02-S09 cancellation releases capacity", () => {
  const database = db();
  const created = book(database);
  cancelAppointment(database, nurse, created.id, 1, "patient-request");
  const again = book(database, transfer, "book-after-cancel");
  assert.equal(again.status, "requested");
  database.close();
});

test("P04-F02-S10 a no-show is recorded after the window", () => {
  const database = db();
  const created = book(database);
  const confirmed = confirmAppointment(database, nurse, created.id, 1);
  const missed = noShowAppointment(database, reception.userId ? { ...nurse, sessionId: "ses_p04f02_noshow" } : nurse, created.id, confirmed.version, "window-passed", "2026-10-20T09:20:00.000Z");
  assert.equal(missed.status, "no-show");
  database.close();
});

test("P04-F02-S11 a no-show cannot overwrite a recorded arrival", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  assert.throws(() => noShowAppointment(database, nurse, created.id, 3, "window-passed", "2026-10-20T12:00:00.000Z"), ConflictError);
  database.close();
});

test("P04-F02-S12 an invalid state transition is rejected", () => {
  const database = db();
  const created = book(database);
  cancelAppointment(database, nurse, created.id, 1, "clinic-request");
  assert.throws(() => confirmAppointment(database, nurse, created.id, 2), ConflictError);
  database.close();
});

test("P04-F02-S13 a duplicate booking submission is idempotent", () => {
  const database = db();
  const first = book(database);
  const second = book(database);
  assert.equal(second.id, first.id);
  assert.equal(second.idempotent, true);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM appointments WHERE source = 'schedule'`)?.c, 1);
  database.close();
});

test("P04-F02-S14 and S44 two processes cannot overbook one exclusive slot", async () => {
  const { database, file } = fileDb();
  database.close();
  const [left, right] = await Promise.all([
    race(file, "request", nurse.userId, "race-left-0900", START),
    race(file, "request", transfer.userId, "race-right-0900", START),
  ]);
  const codes = [left.status, right.status].sort();
  assert.deepEqual(codes, [0, 2], `${left.stderr}\n${right.stderr}`);
  const check = createDatabase(file);
  assert.equal(get<{ c: number }>(check, `SELECT COUNT(*) AS c FROM scheduling_reservations WHERE status IN ('held','active') AND practitioner_id = 'pr_gh_kwame' AND starts_at = ?`, START)?.c, 1);
  check.close();
});

test("P04-F02-S15 overlapping intervals are rejected", () => {
  const database = db();
  book(database);
  assert.throws(() => book(database, transfer, "book-overlap", "2026-10-20T09:10:00.000Z", "2026-10-20T09:30:00.000Z"), ConflictError);
  database.close();
});

test("P04-F02-S16 an authorized reschedule succeeds", () => {
  const database = db();
  const created = book(database);
  const moved = rescheduleAppointment(database, nurse, created.id, 1, { startsAt: LATER, endsAt: LATER_END });
  assert.equal(moved.startsAt, LATER);
  assert.equal(get<{ starts_at: string }>(database, `SELECT starts_at FROM scheduling_reservations WHERE appointment_id = ?`, created.id)?.starts_at, LATER);
  database.close();
});

test("P04-F02-S17 a failed reschedule preserves the original reservation", () => {
  const database = db();
  const created = book(database);
  book(database, transfer, "book-later", LATER, LATER_END);
  assert.throws(() => rescheduleAppointment(database, nurse, created.id, 1, { startsAt: LATER, endsAt: LATER_END }), ConflictError);
  assert.equal(get<{ starts_at: string }>(database, `SELECT starts_at FROM appointments WHERE id = ?`, created.id)?.starts_at, START);
  database.close();
});

test("P04-F02-S18 a stale appointment version is rejected", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  assert.throws(() => cancelAppointment(database, transfer, created.id, 1, "patient-request"), ConflictError);
  assert.equal(get<{ status: string }>(database, `SELECT status FROM appointments WHERE id = ?`, created.id)?.status, "confirmed");
  database.close();
});

test("P04-F02-S19 an authorized clinician starts an encounter", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  const encounter = startVisitEncounter(database, doctor, created.id, 3, "start-kofi-01");
  assert.equal(encounter.status, "in-progress");
  assert.equal(encounter.patientId, "pat_gh_kofi_a");
  database.close();
});

test("P04-F02-S20 a receptionist cannot start an encounter", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  assert.throws(() => startVisitEncounter(database, reception, created.id, 3, "start-denied"), ForbiddenError);
  database.close();
});

test("P04-F02-S21 a duplicate encounter start is idempotent", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  const first = startVisitEncounter(database, doctor, created.id, 3, "start-same");
  const second = startVisitEncounter(database, doctor, created.id, 3, "start-same");
  assert.equal(second.id, first.id);
  assert.equal(second.idempotent, true);
  database.close();
});

test("P04-F02-S22 the encounter references the authoritative patient", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  const encounter = startVisitEncounter(database, doctor, created.id, 3, "start-patient");
  assert.equal(get<{ patient_id: string }>(database, `SELECT patient_id FROM visit_encounters WHERE id = ?`, encounter.id)?.patient_id, "pat_gh_kofi_a");
  database.close();
});

test("P04-F02-S23 an unaffiliated practitioner cannot host the encounter", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  database.prepare(`UPDATE practitioner_affiliations SET status = 'inactive' WHERE practitioner_id = 'pr_gh_kwame'`).run();
  assert.throws(() => startVisitEncounter(database, doctor, created.id, 3, "start-unaffiliated"), ConflictError);
  database.close();
});

test("P04-F02-S24 an encounter closes from a valid state", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  const encounter = startVisitEncounter(database, doctor, created.id, 3, "start-close");
  const closed = closeVisitEncounter(database, doctor, encounter.id, 1, "visit-complete");
  assert.equal(closed.status, "completed");
  assert.equal(get<{ status: string }>(database, `SELECT status FROM appointments WHERE id = ?`, created.id)?.status, "closed");
  database.close();
});

test("P04-F02-S25 an invalid close transition is rejected", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  const encounter = startVisitEncounter(database, doctor, created.id, 3, "start-bad-close");
  assert.throws(() => closeVisitEncounter(database, doctor, encounter.id, 1, "other"), ValidationError);
  database.close();
});

test("P04-F02-S26 encounter status history stays reconstructable", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  const encounter = startVisitEncounter(database, doctor, created.id, 3, "start-history");
  closeVisitEncounter(database, doctor, encounter.id, 1, "visit-complete");
  const read = readVisitEncounter(database, doctor, encounter.id) as { events: Array<{ to_status: string }> };
  assert.deepEqual(read.events.map((event) => event.to_status), ["in-progress", "completed"]);
  database.close();
});

test("P04-F02-S27 concurrent encounter starts create one encounter", async () => {
  const { database, file } = fileDb();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  const other = secondClinician(database);
  database.close();
  const [left, right] = await Promise.all([
    race(file, "start", doctor.userId, "start-race-a", created.id),
    race(file, "start", other.userId, "start-race-b", created.id),
  ]);
  assert.deepEqual([left.status, right.status].sort(), [0, 2], `${left.stderr}\n${right.stderr}`);
  const check = createDatabase(file);
  assert.equal(get<{ c: number }>(check, `SELECT COUNT(*) AS c FROM visit_encounters WHERE appointment_id = ?`, created.id)?.c, 1);
  check.close();
});

test("P04-F02-S28 a closed encounter cannot be reopened", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  const encounter = startVisitEncounter(database, doctor, created.id, 3, "start-reopen");
  closeVisitEncounter(database, doctor, encounter.id, 1, "visit-complete");
  assert.throws(() => startVisitEncounter(database, doctor, created.id, 5, "start-again"), ConflictError);
  database.close();
});

test("P04-F02-S29 cross-tenant appointment access is denied", () => {
  const database = db();
  const created = book(database);
  const euDoctor = { userId: DEMO_EU.users.doctor, organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, sessionId: "ses_p04f02_eudoc" };
  assert.throws(() => readAppointment(database, euDoctor, created.id), NotFoundError);
  database.close();
});

test("P04-F02-S30 cross-facility scheduling access is denied", () => {
  const database = db();
  const created = book(database);
  assert.throws(() => readAppointment(database, reception, created.id), NotFoundError);
  database.close();
});

test("P04-F02-S31 a caller cannot choose another organization", () => {
  const database = db();
  assert.throws(() => requestAppointment(database, nurse, { patientId: "pat_eu_kofi", practitionerId: "pr_gh_kwame", category: "follow-up", startsAt: START, endsAt: END, resourceId: ROOM, idempotencyKey: "book-forged-org" }), NotFoundError);
  database.close();
});

test("P04-F02-S32 a revoked workforce membership loses scheduling access", () => {
  const database = db();
  const invite = { userId: "usr_gh_invite", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f02_invite" };
  assert.throws(() => book(database, invite, "book-revoked"), ForbiddenError);
  database.close();
});

test("P04-F02-S33 unapproved clinical privileges stay denied", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  assert.throws(() => startVisitEncounter(database, admin, created.id, 3, "start-admin"), ForbiddenError);
  database.close();
});

test("P04-F02-S34 an unauthorized user cannot read encounter history", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  const encounter = startVisitEncounter(database, doctor, created.id, 3, "start-hidden");
  const hidden = readVisitEncounter(database, nurse, encounter.id) as { events: unknown[] };
  assert.equal(hidden.events.length, 0);
  database.close();
});

test("P04-F02-S35 appointment communication respects withdrawn consent", () => {
  const database = db();
  const created = book(database);
  const consent = createConsent(database, officer, {
    subjectId: SUBJECT_AKUA,
    authorityId: "auth_akua_self",
    purpose: "COMMUNICATION",
    action: "consent.communication.dispatch",
    resourceCategory: "appointment-reminder",
    recipient: "facility-messenger",
    effectiveAt: "2026-10-14T00:00:00.000Z",
    expiresAt: "2027-10-14T00:00:00.000Z",
    decision: "granted",
    idempotencyKey: "consent-schedule-35",
  });
  verifyAuthority(database, officer, "auth_akua_self", "evidence_self_ack");
  const active = activateConsent(database, officer, consent.id, consent.version);
  const withdrawn = withdrawConsent(database, officer, active.id, active.version, "withdraw-schedule-35");
  assert.equal(withdrawn.status, "withdrawn");
  linkVerifiedSubject(database, admin, "pat_gh_kofi_a", SUBJECT_AKUA, "consent");
  const notice = queueAppointmentReminder(database, nurse, created.id);
  assert.equal(notice.queued, false);
  assert.equal(notice.reason, "consent-withdrawn");
  assert.equal(get<{ status: string }>(database, `SELECT status FROM consent_directives WHERE id = ?`, active.id)?.status, "withdrawn");
  database.close();
});

test("P04-F02-S36 status changes produce protected audit evidence", () => {
  const database = db();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  const audit = get<{ action: string }>(database, `SELECT action FROM audit_events WHERE resource_id = ? AND action = 'appointment.confirm'`, created.id);
  assert.equal(audit?.action, "appointment.confirm");
  assert.equal(verifyAccessLedger(database, admin.organizationId).intact, true);
  database.close();
});

test("P04-F02-S37 sensitive appointment fields do not pass telemetry", () => {
  const snapshot = schedulingSnapshot({ givenName: "Kofi", reason: "chest pain narrative", contact: "0200004400", traceId: "trace_p04f02" });
  const encoded = JSON.stringify(snapshot);
  assert.equal(encoded.includes("Kofi"), false);
  assert.equal(encoded.includes("chest pain"), false);
  assert.equal(encoded.includes("0200004400"), false);
});

test("P04-F02-S38 a scheduling outage fails safely", () => {
  const database = db();
  setSchedulingDependency(database, "unavailable");
  assert.throws(() => book(database, nurse, "book-outage"), ConflictError);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM scheduling_reservations`)?.c, 0);
  setSchedulingDependency(database, "available");
  database.close();
});

test("P04-F02-S39 a restart preserves appointment state", () => {
  const { database, file } = fileDb();
  const created = book(database);
  database.close();
  const reopened = createDatabase(file);
  assert.equal(get<{ status: string }>(reopened, `SELECT status FROM appointments WHERE id = ?`, created.id)?.status, "requested");
  reopened.close();
});

test("P04-F02-S40 concurrent cancellation and arrival stay consistent", async () => {
  const { database, file } = fileDb();
  const created = book(database);
  confirmAppointment(database, nurse, created.id, 1);
  database.close();
  const [left, right] = await Promise.all([
    race(file, "arrive", nurse.userId, "arrive-race", created.id),
    race(file, "cancel", transfer.userId, "cancel-race", created.id),
  ]);
  assert.deepEqual([left.status, right.status].sort(), [0, 2], `${left.stderr}\n${right.stderr}`);
  const check = createDatabase(file);
  const row = get<{ status: string; arrived_at: string | null }>(check, `SELECT status, arrived_at FROM appointments WHERE id = ?`, created.id);
  assert.equal(["arrived", "cancelled"].includes(row?.status ?? ""), true);
  assert.equal(Boolean(row?.arrived_at), row?.status === "arrived");
  check.close();
});

test("P04-F02-S41 timezone conversion preserves the intended local time", () => {
  assert.equal(localToUtc("2026-10-20", "09:00", "Africa/Accra"), "2026-10-20T09:00:00.000Z");
  assert.equal(localToUtc("2026-10-20", "09:00", "Europe/London"), "2026-10-20T08:00:00.000Z");
  const database = db();
  const slots = listSlots(database, nurse, "pr_gh_kwame", "2026-10-20", "follow-up");
  assert.equal(slots.some((slot) => slot.startsAt === START), true);
  database.close();
});

test("P04-F02-S42 migration and fixtures reproduce from a clean database", () => {
  const database = db();
  assert.equal(healthcheck(database).schemaVersion, 63);
  assert.equal(get<{ capacity: number }>(database, `SELECT capacity FROM scheduling_resources WHERE id = ?`, ROOM)?.capacity, 1);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM patients WHERE facility_id = 'fac_riverside'`)?.c, 10);
  database.close();
});

test("P04-F02-S43 a failed operation leaves no orphaned reservation", () => {
  const database = db();
  database.exec(`CREATE TRIGGER fail_res BEFORE INSERT ON scheduling_reservations BEGIN SELECT RAISE(ABORT, 'fail'); END`);
  assert.throws(() => book(database, nurse, "book-orphan"));
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM appointments WHERE source = 'schedule'`)?.c, 0);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM scheduling_reservations`)?.c, 0);
  database.close();
});

test("scheduling rollback returns to the previous schema and can migrate again", () => {
  const { database, file } = fileDb();
  database.exec(CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK);
  database.exec(SCHEDULE_ROLLBACK);
  database.close();
  const reopened = createDatabase(file);
  assert.equal(healthcheck(reopened).schemaVersion, 63);
  assert.equal(get<{ capacity: number }>(reopened, `SELECT capacity FROM scheduling_resources WHERE id = ?`, ROOM)?.capacity, undefined);
  reopened.close();
});

test("a conflict offers another slot for the same practitioner", () => {
  const database = db();
  book(database);
  const alternative = nextOpenSlot(database, nurse, "pr_gh_kwame", "2026-10-20", "follow-up", START);
  assert.equal(alternative?.startsAt, "2026-10-20T09:20:00.000Z");
  database.close();
});
