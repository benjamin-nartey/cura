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
import {
  amendAllergy,
  amendCondition,
  amendMedicationDraft,
  cancelMedicationDraft,
  correctObservation,
  readAllergy,
  readObservation,
  recordAllergy,
  recordCondition,
  recordMedicationDraft,
  recordObservation,
  replaceObservation,
  setSourceDependency,
  signMedicationOrder,
  sourceHistory,
  sourceSnapshot,
  SOURCE_ROLLBACK,
  transmitMedicationOrder,
} from "../src/clinical-source.ts";
import { activateConsent, createConsent, PRIVACY_OFFICER, SUBJECT_AKUA, verifyAuthority, withdrawConsent } from "../src/consent.ts";
import { createDatabase, get } from "../src/db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/errors.ts";
import { linkVerifiedSubject } from "../src/master-records.ts";
import { arriveAppointment, closeVisitEncounter, confirmAppointment, requestAppointment, startVisitEncounter } from "../src/scheduling.ts";
import { seed } from "../src/seed.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";
process.env.CURASPHERE_ENV ??= "local";
process.env.CURASPHERE_DATA_CLASS ??= "synthetic";
process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE ??= "true";

const domainRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const doctor = { userId: DEMO_GH.users.doctor, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f03_doctor" };
const nurse = { userId: DEMO_GH.users.nurse, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f03_nurse" };
const admin = { userId: DEMO_GH.users.admin, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f03_admin" };
const officer = { userId: PRIVACY_OFFICER, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f03_privacy" };
const eu = { userId: DEMO_EU.users.doctor, organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, sessionId: "ses_p04f03_eu" };
function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  return database;
}

function fileDb() {
  const file = path.join(mkdtempSync(path.join(tmpdir(), "cura-source-")), "chart.sqlite");
  const database = createDatabase(file);
  seed(database);
  seedDemoTenants(database);
  return { database, file };
}

function visit(database: ReturnType<typeof db>, key = "visit-kofi-source") {
  const created = requestAppointment(database, nurse, {
    patientId: "pat_gh_kofi_a",
    practitionerId: "pr_gh_kwame",
    category: "follow-up",
    startsAt: "2026-10-21T09:00:00.000Z",
    endsAt: "2026-10-21T09:20:00.000Z",
    resourceId: "room_fac_gh_accra",
    idempotencyKey: key,
  });
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  return startVisitEncounter(database, doctor, created.id, 3, `${key}-start`);
}

function condition(database: ReturnType<typeof db>, encounterId: string, key = "cond-kofi-follow", patientId = "pat_gh_kofi_a", verificationStatus = "unconfirmed") {
  return recordCondition(database, doctor, {
    patientId,
    encounterId,
    practitionerId: "pr_gh_kwame",
    code: "syn-follow-up",
    clinicalStatus: "active",
    verificationStatus,
    idempotencyKey: key,
  });
}

test("P04-F03-S01 an authorized condition entry persists", () => {
  const database = db();
  const opened = visit(database);
  const created = condition(database, opened.id);
  assert.equal(created.clinicalStatus, "active");
  assert.equal(created.version, 1);
  const row = get<{ recorded_by: string; patient_id: string }>(database, `SELECT recorded_by, patient_id FROM source_conditions WHERE id = ?`, created.id);
  assert.equal(row?.recorded_by, doctor.userId);
  assert.equal(row?.patient_id, "pat_gh_kofi_a");
  database.close();
});

test("P04-F03-S02 a missing patient is rejected", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => condition(database, opened.id, "cond-missing", "pat_missing"), NotFoundError);
  database.close();
});

test("P04-F03-S03 an incorrect encounter relationship is rejected", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => condition(database, opened.id, "cond-ama", "pat_gh_ama_serwaa"), ConflictError);
  database.close();
});

test("P04-F03-S04 an unconfirmed diagnosis stays unconfirmed", () => {
  const database = db();
  const opened = visit(database);
  const created = condition(database, opened.id);
  assert.equal(created.verificationStatus, "unconfirmed");
  assert.equal(get<{ verification_status: string }>(database, `SELECT verification_status FROM source_conditions WHERE id = ?`, created.id)?.verification_status, "unconfirmed");
  database.close();
});

test("P04-F03-S05 an invalid clinical-status transition is rejected", () => {
  const database = db();
  const opened = visit(database);
  const created = condition(database, opened.id, "cond-status", "pat_gh_kofi_a", "confirmed");
  amendCondition(database, doctor, created.id, { expectedVersion: 1, clinicalStatus: "resolved", resolutionDate: "2026-10-21", reason: "resolved", idempotencyKey: "cond-resolve" });
  assert.throws(() => amendCondition(database, doctor, created.id, { expectedVersion: 2, clinicalStatus: "active", reason: "reopen", idempotencyKey: "cond-reopen" }), ConflictError);
  database.close();
});

test("P04-F03-S06 entered-in-error preserves condition history", () => {
  const database = db();
  const opened = visit(database);
  const created = condition(database, opened.id, "cond-error");
  amendCondition(database, doctor, created.id, { expectedVersion: 1, verificationStatus: "entered-in-error", reason: "entered-in-error", idempotencyKey: "cond-eie" });
  const versions = sourceHistory(database, doctor, "condition", created.id);
  assert.equal(versions.length, 2);
  assert.equal(versions[0]?.snapshot.verificationStatus, "unconfirmed");
  assert.equal(versions[1]?.snapshot.verificationStatus, "entered-in-error");
  database.close();
});

test("P04-F03-S07 a repeated condition submission is idempotent", () => {
  const database = db();
  const opened = visit(database);
  const first = condition(database, opened.id, "cond-same");
  const second = condition(database, opened.id, "cond-same");
  assert.equal(second.id, first.id);
  assert.equal(second.idempotent, true);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM source_conditions`)?.c, 1);
  database.close();
});

test("P04-F03-S08 an authorized allergy entry persists", () => {
  const database = db();
  const opened = visit(database);
  const created = recordAllergy(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-penicillin", verificationStatus: "confirmed", criticality: "high", idempotencyKey: "alg-penicillin" });
  assert.equal(created.finding, "documented");
  database.close();
});

test("P04-F03-S09 unknown allergy information is not no known allergy", () => {
  const database = db();
  const opened = visit(database);
  const unknown = recordAllergy(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-unknown", verificationStatus: "confirmed", idempotencyKey: "alg-unknown" });
  const none = recordAllergy(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-none-known", verificationStatus: "confirmed", idempotencyKey: "alg-none" });
  assert.equal(unknown.finding, "unknown");
  assert.equal(none.finding, "none-known");
  assert.notEqual(unknown.finding, none.finding);
  database.close();
});

test("P04-F03-S10 an unsupported allergy code is rejected", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => recordAllergy(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-not-real", verificationStatus: "confirmed", idempotencyKey: "alg-bad-code" }), ValidationError);
  database.close();
});

test("P04-F03-S11 an allergy status change preserves versions", () => {
  const database = db();
  const opened = visit(database);
  const created = recordAllergy(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-penicillin", verificationStatus: "confirmed", idempotencyKey: "alg-status" });
  const amended = amendAllergy(database, doctor, created.id, { expectedVersion: 1, clinicalStatus: "inactive", reason: "inactive", idempotencyKey: "alg-inactive" });
  assert.equal(amended.version, 2);
  assert.equal(sourceHistory(database, doctor, "allergy", created.id).length, 2);
  database.close();
});

test("P04-F03-S12 an unauthorized allergy modification fails", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => recordAllergy(database, nurse, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-penicillin", verificationStatus: "confirmed", idempotencyKey: "alg-nurse" }), ForbiddenError);
  database.close();
});

test("P04-F03-S13 an entered-in-error allergy stays visible", () => {
  const database = db();
  const opened = visit(database);
  const created = recordAllergy(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-penicillin", verificationStatus: "unconfirmed", idempotencyKey: "alg-visible" });
  amendAllergy(database, doctor, created.id, { expectedVersion: 1, verificationStatus: "entered-in-error", reason: "entered-in-error", idempotencyKey: "alg-entered" });
  database.prepare(`INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_src_auditor', ?, ?, 'Source Auditor', 'auditor')`).run(DEMO_GH.organizationId, DEMO_GH.facilities.accra.id);
  database.prepare(`INSERT INTO organization_memberships (id, organization_id, user_id, status, version) VALUES ('om_src_auditor', ?, 'usr_src_auditor', 'active', 1)`).run(DEMO_GH.organizationId);
  database.prepare(`INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version) VALUES ('fm_src_auditor', ?, ?, 'usr_src_auditor', 'auditor', 'active', 1)`).run(DEMO_GH.organizationId, DEMO_GH.facilities.accra.id);
  seedAuthorization(database);
  const row = readAllergy(database, { userId: "usr_src_auditor", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04f03_auditor" }, created.id);
  assert.equal(get<{ verification_status: string }>(database, `SELECT verification_status FROM source_allergies WHERE id = ?`, created.id)?.verification_status, "entered-in-error");
  assert.equal(row.history.length, 2);
  database.close();
});

test("P04-F03-S14 a valid temperature observation persists", () => {
  const database = db();
  const opened = visit(database);
  const created = recordObservation(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-temp", valueQuantity: 37.1, unit: "Cel", status: "final", effectiveAt: "2026-10-21T09:05:00.000Z", idempotencyKey: "obs-temp" });
  assert.equal(created.version, 1);
  database.close();
});

test("P04-F03-S15 structured blood pressure components persist", () => {
  const database = db();
  const opened = visit(database);
  const created = recordObservation(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-bp", components: [{ code: "syn-sbp", value: 120 }, { code: "syn-dbp", value: 80 }], status: "final", effectiveAt: "2026-10-21T09:06:00.000Z", idempotencyKey: "obs-pressure" });
  const row = readObservation(database, doctor, created.id);
  assert.equal(row.components.length, 2);
  database.close();
});

test("P04-F03-S16 an invalid unit is rejected", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => recordObservation(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-temp", valueQuantity: 37.1, unit: "F", status: "final", effectiveAt: "2026-10-21T09:05:00.000Z", idempotencyKey: "obs-unit" }), ValidationError);
  database.close();
});

test("P04-F03-S17 an invalid value type is rejected", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => recordObservation(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-temp", status: "final", effectiveAt: "2026-10-21T09:05:00.000Z", idempotencyKey: "obs-type" }), ValidationError);
  database.close();
});

test("P04-F03-S18 effective time and recording time stay distinct", () => {
  const database = db();
  const opened = visit(database);
  const created = recordObservation(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-hr", valueQuantity: 72, unit: "/min", status: "final", effectiveAt: "2026-10-21T09:05:00.000Z", idempotencyKey: "obs-time" });
  const row = get<{ effective_at: string; recorded_at: string }>(database, `SELECT effective_at, recorded_at FROM source_observations WHERE id = ?`, created.id);
  assert.equal(row?.effective_at, "2026-10-21T09:05:00.000Z");
  assert.notEqual(row?.recorded_at, row?.effective_at);
  database.close();
});

test("P04-F03-S19 a corrected observation preserves the original value", () => {
  const database = db();
  const opened = visit(database);
  const created = recordObservation(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-temp", valueQuantity: 38.1, unit: "Cel", status: "final", effectiveAt: "2026-10-21T09:05:00.000Z", idempotencyKey: "obs-wrong" });
  correctObservation(database, doctor, created.id, { expectedVersion: 1, valueQuantity: 37.1, reason: "entry-error", idempotencyKey: "obs-right" });
  const versions = sourceHistory(database, doctor, "observation", created.id);
  assert.equal(versions[0]?.snapshot.value, 38.1);
  assert.equal(versions[1]?.snapshot.value, 37.1);
  assert.equal(get<{ value_quantity: number }>(database, `SELECT value_quantity FROM source_observations WHERE id = ?`, created.id)?.value_quantity, 37.1);
  database.close();
});

test("P04-F03-S20 and S50 a stale correction from another process is rejected", async () => {
  const { database, file } = fileDb();
  const opened = visit(database, "visit-race");
  const created = recordObservation(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-temp", valueQuantity: 38.1, unit: "Cel", status: "final", effectiveAt: "2026-10-21T09:05:00.000Z", idempotencyKey: "obs-race" });
  database.close();
  const race = (key: string, value: string) => new Promise<number | null>((resolve) => {
    const child = spawn(process.execPath, ["--import", "tsx", path.join(domainRoot, "test", "clinical-racer.ts"), file, created.id, doctor.userId, key, value], { cwd: domainRoot });
    child.on("close", (status) => resolve(status));
  });
  const codes = (await Promise.all([race("obs-race-a", "37.1"), race("obs-race-b", "36.5")])).sort();
  assert.deepEqual(codes, [0, 2]);
  const check = createDatabase(file);
  assert.equal(get<{ version: number }>(check, `SELECT version FROM source_observations WHERE id = ?`, created.id)?.version, 2);
  assert.equal(get<{ c: number }>(check, `SELECT COUNT(*) AS c FROM source_versions WHERE record_id = ?`, created.id)?.c, 2);
  check.close();
});

test("P04-F03-S21 a finalized observation cannot be overwritten", () => {
  const database = db();
  const opened = visit(database);
  const created = recordObservation(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-temp", valueQuantity: 37.1, unit: "Cel", status: "final", effectiveAt: "2026-10-21T09:05:00.000Z", idempotencyKey: "obs-final" });
  assert.throws(() => replaceObservation(), ConflictError);
  assert.equal(get<{ value_quantity: number }>(database, `SELECT value_quantity FROM source_observations WHERE id = ?`, created.id)?.value_quantity, 37.1);
  database.close();
});

test("P04-F03-S22 a duplicate observation request is idempotent", () => {
  const database = db();
  const opened = visit(database);
  const input = { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-temp", valueQuantity: 37.1, unit: "Cel", status: "final" as const, effectiveAt: "2026-10-21T09:05:00.000Z", idempotencyKey: "obs-same" };
  const first = recordObservation(database, doctor, input);
  const second = recordObservation(database, doctor, input);
  assert.equal(second.id, first.id);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM source_observations`)?.c, 1);
  database.close();
});

test("P04-F03-S23 and S24 a medication draft is stored and not executable", () => {
  const database = db();
  const opened = visit(database);
  const created = recordMedicationDraft(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-paracetamol", dose: 500, idempotencyKey: "med-draft" });
  assert.equal(created.status, "draft");
  assert.equal(created.executable, false);
  assert.equal(created.transmission, "disabled");
  assert.equal(get<{ executable: number }>(database, `SELECT executable FROM source_medication_orders WHERE id = ?`, created.id)?.executable, 0);
  database.close();
});

test("P04-F03-S25 unauthorized signing is refused", () => {
  const database = db();
  const opened = visit(database);
  const created = recordMedicationDraft(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-paracetamol", dose: 500, idempotencyKey: "med-sign" });
  assert.throws(() => signMedicationOrder(database, doctor, created.id), ForbiddenError);
  assert.equal(get<{ status: string }>(database, `SELECT status FROM source_medication_orders WHERE id = ?`, created.id)?.status, "draft");
  database.close();
});

test("P04-F03-S26 pharmacy transmission stays disabled", () => {
  const database = db();
  const opened = visit(database);
  recordMedicationDraft(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-paracetamol", dose: 500, idempotencyKey: "med-send" });
  const before = get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM outbox`)?.c;
  assert.throws(() => transmitMedicationOrder(database, doctor), ForbiddenError);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM outbox`)?.c, before);
  database.close();
});

test("P04-F03-S27 an invalid medication code or dose fails", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => recordMedicationDraft(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-nope", dose: 500, idempotencyKey: "med-code" }), ValidationError);
  assert.throws(() => recordMedicationDraft(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-paracetamol", dose: 0, idempotencyKey: "med-dose" }), ValidationError);
  database.close();
});

test("P04-F03-S28 a draft amendment preserves history", () => {
  const database = db();
  const opened = visit(database);
  const created = recordMedicationDraft(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-paracetamol", dose: 500, idempotencyKey: "med-amend" });
  amendMedicationDraft(database, doctor, created.id, { expectedVersion: 1, dose: 1000, reason: "dose-corrected", idempotencyKey: "med-amended" });
  const versions = sourceHistory(database, doctor, "medication-order", created.id);
  assert.equal(versions[0]?.snapshot.dose, 500);
  assert.equal(versions[1]?.snapshot.dose, 1000);
  database.close();
});

test("P04-F03-S29 a duplicate draft submission is idempotent", () => {
  const database = db();
  const opened = visit(database);
  const input = { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-paracetamol", dose: 500, idempotencyKey: "med-same" };
  const first = recordMedicationDraft(database, doctor, input);
  const second = recordMedicationDraft(database, doctor, input);
  assert.equal(second.id, first.id);
  database.close();
});

test("P04-F03-S30 an invalid cancellation transition is rejected", () => {
  const database = db();
  const opened = visit(database);
  const created = recordMedicationDraft(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-paracetamol", dose: 500, idempotencyKey: "med-cancel" });
  cancelMedicationDraft(database, doctor, created.id, { expectedVersion: 1, reason: "patient-request", idempotencyKey: "med-cancelled" });
  assert.throws(() => cancelMedicationDraft(database, doctor, created.id, { expectedVersion: 2, reason: "patient-request", idempotencyKey: "med-again" }), ConflictError);
  database.close();
});

test("P04-F03-S31 and S32 and S33 authorship history and immutability hold", () => {
  const database = db();
  const opened = visit(database);
  const created = condition(database, opened.id, "cond-history", "pat_gh_kofi_a", "confirmed");
  const versions = sourceHistory(database, doctor, "condition", created.id);
  assert.equal(versions[0]?.actor_id, doctor.userId);
  assert.equal(versions[0]?.version, 1);
  assert.throws(() => database.prepare(`UPDATE source_versions SET reason = 'rewritten' WHERE record_id = ?`).run(created.id), /immutable/);
  database.close();
});

test("P04-F03-S34 a closed encounter rejects ordinary recording", () => {
  const database = db();
  const opened = visit(database);
  closeVisitEncounter(database, doctor, opened.id, 1, "visit-complete");
  assert.throws(() => condition(database, opened.id, "cond-closed"), ConflictError);
  database.close();
});

test("P04-F03-S35 an authorized amendment succeeds on a closed encounter", () => {
  const database = db();
  const opened = visit(database);
  const created = condition(database, opened.id, "cond-later");
  closeVisitEncounter(database, doctor, opened.id, 1, "visit-complete");
  const amended = amendCondition(database, doctor, created.id, { expectedVersion: 1, verificationStatus: "confirmed", reason: "confirmed", idempotencyKey: "cond-confirm" });
  assert.equal(amended.verificationStatus, "confirmed");
  database.close();
});

test("P04-F03-S36 an unauthorized amendment fails", () => {
  const database = db();
  const opened = visit(database);
  const created = condition(database, opened.id, "cond-nurse");
  assert.throws(() => amendCondition(database, nurse, created.id, { expectedVersion: 1, verificationStatus: "confirmed", reason: "confirmed", idempotencyKey: "cond-nurse-amend" }), ForbiddenError);
  database.close();
});

test("P04-F03-S37 a patient merge does not erase source provenance", () => {
  const database = db();
  const opened = visit(database, "visit-merge");
  const created = requestAppointment(database, nurse, { patientId: "pat_gh_kofi_b", practitionerId: "pr_gh_kwame", category: "follow-up", startsAt: "2026-10-21T10:00:00.000Z", endsAt: "2026-10-21T10:20:00.000Z", resourceId: "room_fac_gh_accra", idempotencyKey: "visit-kofi-b" });
  confirmAppointment(database, nurse, created.id, 1);
  arriveAppointment(database, nurse, created.id, 2);
  const second = startVisitEncounter(database, doctor, created.id, 3, "visit-kofi-b-start");
  const recorded = condition(database, second.id, "cond-kofi-b", "pat_gh_kofi_b", "confirmed");
  database.prepare(`UPDATE patients SET registration_status = 'merged', merged_into_id = 'pat_gh_kofi_a' WHERE id = 'pat_gh_kofi_b'`).run();
  assert.equal(get<{ patient_id: string }>(database, `SELECT patient_id FROM source_conditions WHERE id = ?`, recorded.id)?.patient_id, "pat_gh_kofi_b");
  assert.equal(sourceHistory(database, doctor, "condition", recorded.id)[0]?.actor_id, doctor.userId);
  assert.throws(() => condition(database, second.id, "cond-b-again", "pat_gh_kofi_b"), ValidationError);
  database.close();
});

test("P04-F03-S38 cross-tenant clinical access is denied", () => {
  const database = db();
  const opened = visit(database);
  const created = condition(database, opened.id, "cond-tenant");
  assert.throws(() => readAllergy(database, eu, created.id), NotFoundError);
  assert.throws(() => sourceHistory(database, eu, "condition", created.id), (error: unknown) => error instanceof NotFoundError || error instanceof ForbiddenError);
  database.close();
});

test("P04-F03-S39 cross-facility clinical access is denied", () => {
  const database = db();
  const opened = visit(database);
  const created = condition(database, opened.id, "cond-facility");
  const east = { ...doctor, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_p04f03_east" };
  assert.throws(() => sourceHistory(database, east, "condition", created.id), ForbiddenError);
  database.close();
});

test("P04-F03-S40 a caller cannot choose another organization", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => condition(database, opened.id, "cond-eu-patient", "pat_eu_kofi"), NotFoundError);
  database.close();
});

test("P04-F03-S41 a revoked clinician loses write privileges", () => {
  const database = db();
  const opened = visit(database);
  database.prepare(`UPDATE organization_memberships SET status = 'revoked' WHERE user_id = ?`).run(doctor.userId);
  assert.throws(() => condition(database, opened.id, "cond-revoked"), ForbiddenError);
  database.close();
});

test("P04-F03-S42 an organization administrator cannot author clinical entries", () => {
  const database = db();
  const opened = visit(database);
  assert.throws(() => recordCondition(database, admin, { patientId: "pat_gh_kofi_a", encounterId: opened.id, practitionerId: "pr_gh_kwame", code: "syn-follow-up", clinicalStatus: "active", verificationStatus: "unconfirmed", idempotencyKey: "cond-admin" }), ForbiddenError);
  database.close();
});

test("P04-F03-S43 and S52 source access produces a verifiable audit chain", () => {
  const database = db();
  const opened = visit(database);
  const created = condition(database, opened.id, "cond-audit");
  const audit = get<{ action: string }>(database, `SELECT action FROM audit_events WHERE resource_id = ? AND action = 'clinical.condition.record'`, created.id);
  assert.equal(audit?.action, "clinical.condition.record");
  const encoded = JSON.stringify(database.prepare(`SELECT action, resource_id FROM audit_events WHERE resource_id = ?`).all(created.id));
  assert.equal(encoded.includes("38.1"), false);
  assert.equal(verifyAccessLedger(database, doctor.organizationId).intact, true);
  database.close();
});

test("P04-F03-S44 clinical values stay out of telemetry", () => {
  const snapshot = sourceSnapshot({ name: "Kofi Mensah", value: "38.1 Cel", traceId: "trace_p04f03" });
  const encoded = JSON.stringify(snapshot);
  assert.equal(encoded.includes("Kofi"), false);
  assert.equal(encoded.includes("38.1"), false);
  assert.equal(encoded.includes("Cel"), false);
  databaseClose: {
    const database = db();
    recordObservation(database, doctor, { patientId: "pat_gh_kofi_a", encounterId: visit(database).id, practitionerId: "pr_gh_kwame", code: "syn-temp", valueQuantity: 38.1, unit: "Cel", status: "final", effectiveAt: "2026-10-21T09:05:00.000Z", idempotencyKey: "obs-metric" });
    const names = database.prepare(`SELECT name FROM source_metrics`).all() as Array<{ name: string }>;
    assert.equal(JSON.stringify(names).includes("38.1"), false);
    assert.equal(JSON.stringify(names).includes("Kofi"), false);
    database.close();
  }
});

test("P04-F03-S45 withdrawn consent stays withdrawn", () => {
  const database = db();
  const opened = visit(database);
  const consent = createConsent(database, officer, { subjectId: SUBJECT_AKUA, authorityId: "auth_akua_self", purpose: "COMMUNICATION", action: "consent.communication.dispatch", resourceCategory: "appointment-reminder", recipient: "facility-messenger", effectiveAt: "2026-10-14T00:00:00.000Z", expiresAt: "2027-10-14T00:00:00.000Z", decision: "granted", idempotencyKey: "consent-source-45" });
  verifyAuthority(database, officer, "auth_akua_self", "evidence_self_ack");
  const active = activateConsent(database, officer, consent.id, consent.version);
  withdrawConsent(database, officer, active.id, active.version, "withdraw-source-45");
  linkVerifiedSubject(database, admin, "pat_gh_kofi_a", SUBJECT_AKUA, "consent");
  condition(database, opened.id, "cond-consent");
  assert.equal(get<{ status: string }>(database, `SELECT status FROM consent_directives WHERE id = ?`, active.id)?.status, "withdrawn");
  database.close();
});

test("P04-F03-S46 source entry does not call an AI service", () => {
  const source = readFileSync(new URL("../src/clinical-source.ts", import.meta.url), "utf8");
  assert.equal(source.includes("invokeGateway"), false);
  assert.equal(source.includes("openai"), false);
});

test("P04-F03-S47 a database outage fails safely", () => {
  const database = db();
  const opened = visit(database);
  setSourceDependency(database, "unavailable");
  assert.throws(() => condition(database, opened.id, "cond-down"), ConflictError);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM source_conditions`)?.c, 0);
  database.close();
});

test("P04-F03-S48 a restart preserves entries and versions", () => {
  const { database, file } = fileDb();
  const opened = visit(database, "visit-restart");
  const created = condition(database, opened.id, "cond-restart");
  database.close();
  const reopened = createDatabase(file);
  assert.equal(get<{ version: number }>(reopened, `SELECT version FROM source_conditions WHERE id = ?`, created.id)?.version, 1);
  assert.equal(healthcheck(reopened).schemaVersion, 63);
  reopened.close();
});

test("P04-F03-S49 a failed transaction leaves no partial history", () => {
  const database = db();
  const opened = visit(database);
  database.exec(`CREATE TRIGGER source_fail BEFORE INSERT ON source_versions BEGIN SELECT RAISE(ABORT, 'forced'); END`);
  assert.throws(() => condition(database, opened.id, "cond-fail"));
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM source_conditions`)?.c, 0);
  assert.equal(get<{ c: number }>(database, `SELECT COUNT(*) AS c FROM source_versions`)?.c, 0);
  database.close();
});

test("P04-F03-S51 migration and fixtures reproduce from a clean database", () => {
  const { database, file } = fileDb();
  assert.equal(healthcheck(database).schemaVersion, 63);
  assert.equal(get<{ id: string }>(database, `SELECT id FROM retention_policies WHERE id = 'pol_syn_gh_source'`)?.id, "pol_syn_gh_source");
  database.exec(CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK);
  database.exec(SOURCE_ROLLBACK);
  database.close();
  const reopened = createDatabase(file);
  assert.equal(healthcheck(reopened).schemaVersion, 63);
  assert.equal(get<{ name: string }>(reopened, `SELECT name FROM sqlite_master WHERE name = 'source_conditions'`)?.name, "source_conditions");
  reopened.close();
});
