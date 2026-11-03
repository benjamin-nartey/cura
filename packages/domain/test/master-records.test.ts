import { CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK } from "../src/code-system-schema.ts";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyAccessLedger } from "../src/access-ledger.ts";
import { effectivePermissions } from "../src/authorization.ts";
import { healthcheck } from "../src/chart.ts";
import { SUBJECT_AKUA } from "../src/consent.ts";
import { createDatabase } from "../src/db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/errors.ts";
import {
  affiliatePractitioner,
  commitRegistration,
  createPractitioner,
  decideDuplicate,
  findDuplicateMatches,
  linkPractitioner,
  linkVerifiedSubject,
  listDuplicateCandidates,
  listMasterPatients,
  listPractitioners,
  MASTER_ROLLBACK,
  mergePatients,
  openRegistrationDraft,
  readDuplicateCandidate,
  readMasterPatient,
  readPractitioner,
  refusePatientDisposal,
  registerPatientFacility,
  updatePatientDemographics,
  updatePractitioner,
} from "../src/master-records.ts";
import { seed } from "../src/seed.ts";
import { sanitizeTelemetry } from "../src/telemetry.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";

const admin = { userId: DEMO_GH.users.admin, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04_admin" };
const doctor = { userId: DEMO_GH.users.doctor, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_p04_doctor" };
const nurseEast = { userId: DEMO_GH.users.nurse, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_p04_nurse" };
const reception = { userId: DEMO_GH.users.reception, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_p04_reception" };
const eu = { userId: DEMO_EU.users.admin, organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, sessionId: "ses_p04_eu" };

function db() {
  const database = createDatabase(path.join(mkdtempSync(path.join(tmpdir(), "curasphere-p04-")), "chart.sqlite"));
  seed(database);
  seedDemoTenants(database);
  return database;
}

test("P04-F01-S01 through S07 registration validation authorization and idempotency", () => {
  const database = db();
  assert.equal(healthcheck(database).schemaVersion, 49);
  const harbor = database.prepare(`SELECT COUNT(*) AS c FROM patients WHERE organization_id = 'org_harborlight'`).get() as { c: number };
  const north = database.prepare(`SELECT COUNT(*) AS c FROM patients WHERE organization_id = 'org_northwind'`).get() as { c: number };
  assert.equal(harbor.c, 13);
  assert.equal(north.c, 3);
  assert.equal(database.prepare(`SELECT id FROM patients WHERE id = ?`).get(SUBJECT_AKUA), undefined);
  const beforeConsent = database.prepare(`SELECT COUNT(*) AS c FROM consent_directives`).get() as { c: number };
  assert.throws(() => openRegistrationDraft(database, reception, { givenName: "Ama", familyName: "Mensah", birthDate: "1988-01-02", sex: "female", idempotencyKey: "reg-denied" }), ForbiddenError);
  assert.throws(() => openRegistrationDraft(database, doctor, { givenName: "", familyName: "Mensah", birthDate: "1988-01-02", sex: "female", idempotencyKey: "reg-blank" }), ValidationError);
  assert.throws(() => openRegistrationDraft(database, doctor, { givenName: "Ama", familyName: "Mensah", birthDate: "1988/01/02", sex: "female", idempotencyKey: "reg-date" }), ValidationError);
  const warned = openRegistrationDraft(database, doctor, { givenName: "Kofi", familyName: "Mensah", birthDate: "1990-04-04", sex: "male", idempotencyKey: "reg-kofi-new" });
  assert.equal(warned.matches.length > 0, true);
  const created = commitRegistration(database, doctor, warned.draftId);
  assert.equal(created.candidateCount > 0, true);
  const again = openRegistrationDraft(database, doctor, { givenName: "Kofi", familyName: "Mensah", birthDate: "1990-04-04", sex: "male", idempotencyKey: "reg-kofi-new" });
  const replay = commitRegistration(database, doctor, again.draftId);
  assert.equal(replay.idempotent, true);
  assert.equal(replay.id, created.id);
  const afterConsent = database.prepare(`SELECT COUNT(*) AS c FROM consent_directives`).get() as { c: number };
  assert.equal(afterConsent.c, beforeConsent.c);
  const active = database.prepare(`SELECT registration_status FROM patients WHERE id = ?`).get(created.id) as { registration_status: string };
  assert.equal(active.registration_status, "active");
  database.close();
});

test("P04-F01-S08 through S15 duplicate matching stays a candidate", () => {
  const database = db();
  const exact = findDuplicateMatches(database, DEMO_GH.organizationId, { givenName: "Other", familyName: "Person", birthDate: "1970-01-01", identifier: { system: "local-mrn", value: "ACC-4401" } });
  assert.equal(exact.some((row) => row.id === "pat_gh_kofi_a" && row.reason === "identifier"), true);
  const otherIssuer = findDuplicateMatches(database, DEMO_EU.organizationId, { givenName: "Other", familyName: "Person", birthDate: "1970-01-01", identifier: { system: "local-mrn", value: "ACC-4401" } });
  assert.equal(otherIssuer.some((row) => row.id === "pat_eu_kofi"), true);
  assert.equal(otherIssuer.some((row) => row.id === "pat_gh_kofi_a"), false);
  const similar = findDuplicateMatches(database, DEMO_GH.organizationId, { givenName: "Kofi", familyName: "Mensah", birthDate: "1990-04-04" });
  assert.equal(similar.filter((row) => row.reason === "name-birth").length >= 2, true);
  const birthOnly = findDuplicateMatches(database, DEMO_GH.organizationId, { givenName: "Ama", familyName: "Serwaa", birthDate: "1990-04-04" });
  assert.equal(birthOnly.some((row) => row.reason === "name-birth" && row.id.startsWith("pat_gh_kofi")), false);
  const contact = findDuplicateMatches(database, DEMO_GH.organizationId, { givenName: "Different", familyName: "Person", birthDate: "2001-01-01", contact: "0200004400" });
  assert.equal(contact.some((row) => row.reason === "contact"), true);
  const ghQueue = listDuplicateCandidates(database, doctor);
  assert.equal(ghQueue.some((row) => row.id === "dup_pat_gh_kofi"), true);
  const euQueue = listDuplicateCandidates(database, eu);
  assert.equal(euQueue.some((row) => row.left_patient_id.startsWith("pat_gh")), false);
  const review = readDuplicateCandidate(database, admin, "dup_pat_gh_kofi");
  assert.equal(review.reason, "name-birth");
  assert.equal(review.status, "open");
  database.close();
});

test("P04-F01-S16 through S24 controlled merge is human authorized and reversible on failure", () => {
  const database = db();
  assert.throws(() => mergePatients(database, doctor, "dup_pat_gh_kofi", 1, "pat_gh_kofi_a", "merge-denied"), ForbiddenError);
  assert.throws(() => mergePatients(database, admin, "dup_pat_gh_kofi", 9, "pat_gh_kofi_a", "merge-stale"), ConflictError);
  assert.throws(() => mergePatients(database, eu, "dup_pat_gh_kofi", 1, "pat_gh_kofi_a", "merge-cross"), NotFoundError);
  assert.throws(() => decideDuplicate(database, admin, "dup_pat_gh_kofi", 1, "merge", "pat_missing", "merge-self"), ValidationError);
  database.exec(`CREATE TRIGGER fail_merge BEFORE INSERT ON patient_merges BEGIN SELECT RAISE(ABORT, 'fail'); END`);
  assert.throws(() => mergePatients(database, admin, "dup_pat_gh_kofi", 1, "pat_gh_kofi_a", "merge-fail"));
  database.exec(`DROP TRIGGER fail_merge`);
  const still = database.prepare(`SELECT registration_status, merged_into_id FROM patients WHERE id = 'pat_gh_kofi_b'`).get() as { registration_status: string; merged_into_id: string | null };
  assert.equal(still.registration_status, "active");
  assert.equal(still.merged_into_id, null);
  database.prepare(`INSERT INTO conditions (id, organization_id, facility_id, patient_id, code, code_system, code_system_version, display, clinical_status, recorded_at, author_id) VALUES ('cond_kofi_b', 'org_demo_gh', 'fac_gh_accra', 'pat_gh_kofi_b', '000', 'local', '1', 'synthetic', 'active', '2026-01-15T00:00:00.000Z', 'usr_gh_doctor')`).run();
  const merged = mergePatients(database, admin, "dup_pat_gh_kofi", 1, "pat_gh_kofi_a", "merge-ok");
  assert.equal(merged.retiredId, "pat_gh_kofi_b");
  assert.equal(merged.blockedResources.includes("conditions"), true);
  const replay = mergePatients(database, admin, "dup_pat_gh_kofi", 1, "pat_gh_kofi_a", "merge-ok");
  assert.equal(replay.id, merged.id);
  assert.throws(() => mergePatients(database, admin, "dup_pat_gh_kofi", 2, "pat_gh_kofi_b", "merge-again"), ConflictError);
  const retired = database.prepare(`SELECT registration_status, merged_into_id FROM patients WHERE id = 'pat_gh_kofi_b'`).get() as { registration_status: string; merged_into_id: string | null };
  assert.equal(retired.registration_status, "merged");
  assert.equal(retired.merged_into_id, "pat_gh_kofi_a");
  const identifier = database.prepare(`SELECT value FROM patient_identifiers WHERE patient_id = 'pat_gh_kofi_b'`).get() as { value: string };
  assert.equal(identifier.value, "ACC-4402");
  const condition = database.prepare(`SELECT patient_id FROM conditions WHERE id = 'cond_kofi_b'`).get() as { patient_id: string };
  assert.equal(condition.patient_id, "pat_gh_kofi_b");
  const history = database.prepare(`SELECT reason FROM patient_versions WHERE patient_id = 'pat_gh_kofi_b'`).all() as Array<{ reason: string }>;
  assert.equal(history.some((row) => row.reason === "merged"), true);
  const distinct = openRegistrationDraft(database, doctor, { givenName: "Kojo", familyName: "Different", birthDate: "1981-02-02", sex: "male", contact: "0200004400", idempotencyKey: "reg-contact" });
  const committed = commitRegistration(database, doctor, distinct.draftId);
  const candidate = database.prepare(`SELECT id, version FROM duplicate_candidates WHERE status = 'open' AND (left_patient_id = ? OR right_patient_id = ?) LIMIT 1`).get(committed.id, committed.id) as { id: string; version: number };
  const decision = decideDuplicate(database, admin, candidate.id, candidate.version, "different");
  assert.equal(decision.status, "rejected");
  const separate = database.prepare(`SELECT registration_status FROM patients WHERE id = ?`).get(committed.id) as { registration_status: string };
  assert.equal(separate.registration_status, "active");
  database.close();
});

test("P04-F01-S25 through S32 practitioners stay distinct from workforce access", () => {
  const database = db();
  const before = effectivePermissions(database, doctor.userId, doctor.organizationId, doctor.facilityId).permissions;
  const created = createPractitioner(database, admin, { displayName: "Esi Mensah", roleType: "doctor", licenseNumber: "SYN-LIC-0099", licenseIssuer: "SYNTHETIC-GH", facilityId: DEMO_GH.facilities.accra.id });
  assert.equal(created.verificationState, "fictional-unverified");
  assert.throws(() => updatePractitioner(database, admin, created.id, 1, { verificationState: "verified" }), ValidationError);
  assert.throws(() => affiliatePractitioner(database, admin, created.id, DEMO_EU.facilities.northbridge.id), ValidationError);
  const affiliated = affiliatePractitioner(database, admin, created.id, DEMO_GH.facilities.eastLegon.id);
  assert.equal(affiliated.facilityId, DEMO_GH.facilities.eastLegon.id);
  assert.throws(() => linkPractitioner(database, admin, created.id, "usr_gh_invite"), ForbiddenError);
  assert.throws(() => linkPractitioner(database, admin, created.id, DEMO_EU.users.admin), ForbiddenError);
  const linked = linkPractitioner(database, admin, "pr_gh_kwame", DEMO_GH.users.doctor);
  assert.equal(linked.userId, DEMO_GH.users.doctor);
  const after = effectivePermissions(database, doctor.userId, doctor.organizationId, doctor.facilityId).permissions;
  assert.deepEqual(after, before);
  assert.equal(before.includes("patient.merge"), false);
  assert.throws(() => linkPractitioner(database, admin, "pr_gh_visitor", DEMO_GH.users.doctor), ConflictError);
  const profile = readPractitioner(database, doctor, "pr_gh_kwame");
  assert.equal(profile.link?.user_id, DEMO_GH.users.doctor);
  assert.equal(profile.verification_state, "fictional-unverified");
  const directory = listPractitioners(database, doctor);
  assert.equal(directory.some((row) => row.id === "pr_gh_visitor" && row.status === "inactive" && row.linked_user === null), true);
  assert.throws(() => readPractitioner(database, eu, "pr_gh_kwame"), NotFoundError);
  database.close();
});

test("P04-F01-S33 through S40 privacy isolation concurrency and recovery", () => {
  const database = db();
  assert.throws(() => readMasterPatient(database, eu, "pat_gh_kofi_a"), NotFoundError);
  const receptionRows = listMasterPatients(database, reception, "Kofi");
  assert.equal(receptionRows.some((row) => row.id === "pat_gh_kofi_a"), false);
  const east = listMasterPatients(database, nurseEast, "Kofi");
  assert.equal(east.some((row) => row.id === "pat_gh_kofi_a"), false);
  registerPatientFacility(database, admin, "pat_gh_kofi_a", DEMO_GH.facilities.eastLegon.id);
  const shared = listMasterPatients(database, nurseEast, "Kofi");
  assert.equal(shared.some((row) => row.id === "pat_gh_kofi_a"), true);
  assert.throws(() => updatePatientDemographics(database, doctor, "pat_gh_kofi_a", 1, { preferredName: "K" }), ForbiddenError);
  assert.throws(() => updatePatientDemographics(database, admin, "pat_gh_kofi_a", 9, { preferredName: "K" }), ConflictError);
  const updated = updatePatientDemographics(database, admin, "pat_gh_kofi_a", 1, { preferredName: "Kojo" });
  assert.equal(updated.version, 2);
  assert.throws(() => updatePatientDemographics(database, admin, "pat_gh_kofi_a", 1, { preferredName: "Other" }), ConflictError);
  const profile = readMasterPatient(database, doctor, "pat_gh_kofi_a");
  assert.equal(profile.preferred_name, "Kojo");
  const audit = database.prepare(`SELECT actor_id FROM audit_events WHERE action = 'patient.read' AND resource_id = 'pat_gh_kofi_a'`).get() as { actor_id: string };
  assert.equal(audit.actor_id, doctor.userId);
  assert.equal(verifyAccessLedger(database, DEMO_GH.organizationId).intact, true);
  const sanitized = JSON.stringify(sanitizeTelemetry({ givenName: "Kofi", mrn: "ACC-4401", traceId: "trc_p04" }));
  assert.equal(sanitized.includes("Kofi"), false);
  assert.equal(sanitized.includes("ACC-4401"), false);
  linkVerifiedSubject(database, admin, "pat_gh_kofi_a", SUBJECT_AKUA, "consent");
  assert.equal(database.prepare(`SELECT id FROM patients WHERE id = ?`).get(SUBJECT_AKUA), undefined);
  assert.throws(() => refusePatientDisposal(), ForbiddenError);
  const policy = database.prepare(`SELECT approval_state, expiry_action FROM retention_policies WHERE id = 'pol_syn_gh_master'`).get() as { approval_state: string; expiry_action: string };
  assert.equal(policy.approval_state, "pending_policy_approval");
  assert.equal(policy.expiry_action, "retain");
  database.close();
  const file = path.join(mkdtempSync(path.join(tmpdir(), "curasphere-p04-restore-")), "chart.sqlite");
  const first = createDatabase(file);
  seed(first);
  seedDemoTenants(first);
  first.close();
  const persisted = createDatabase(file);
  assert.equal((persisted.prepare(`SELECT id FROM patients WHERE id = 'pat_gh_kofi_a'`).get() as { id: string }).id, "pat_gh_kofi_a");
  persisted.exec(CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK);
  persisted.exec(MASTER_ROLLBACK);
  assert.equal((persisted.prepare(`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`).get() as { version: number }).version, 37);
  persisted.close();
  const upgraded = createDatabase(file);
  assert.equal(healthcheck(upgraded).schemaVersion, 49);
  assert.equal((upgraded.prepare(`SELECT id FROM patients WHERE id = 'pat_gh_kofi_a'`).get() as { id: string }).id, "pat_gh_kofi_a");
  upgraded.close();
});

test("P04-F01-S41 the directory fixture refuses production", () => {
  const result = spawnSync(process.execPath, ["tools/fixtures/seed-local-directory.mjs"], {
    cwd: path.join(import.meta.dirname, "../.."),
    env: { ...process.env, CURASPHERE_ENV: "production", CURASPHERE_DATA_CLASS: "synthetic", CURASPHERE_LOCAL_PHASE_OVERRIDE: "true" },
  });
  assert.notEqual(result.status, 0);
});
