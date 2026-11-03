import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { authorize } from "../src/authorization.ts";
import { verifyAccessLedger } from "../src/access-ledger.ts";
import {
  activateConsent,
  consentHistory,
  CONSENT_ROLLBACK,
  createConsent,
  dispatchConsentJob,
  evaluateConsent,
  installConsentGate,
  PRIVACY_OFFICER,
  queueConsentDispatch,
  setConsentDependency,
  SUBJECT_AKUA,
  verifyAuthority,
  withdrawConsent,
} from "../src/consent.ts";
import { createDatabase } from "../src/db.ts";
import { ConflictError, ForbiddenError, ValidationError } from "../src/errors.ts";
import { healthcheck } from "../src/chart.ts";
import { seed } from "../src/seed.ts";
import { DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";

installConsentGate();
process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";

const officer = { userId: PRIVACY_OFFICER, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_consent_officer" };
const auditor = { userId: "usr_gh_reviewer", organizationId: DEMO_GH.organizationId, facilityId: null as string | null, sessionId: "ses_consent_auditor" };
const doctor = { userId: DEMO_GH.users.doctor, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_consent_doctor" };
const reception = { userId: DEMO_GH.users.reception, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_consent_reception" };

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  return database;
}

function grant(database: ReturnType<typeof db>, key: string) {
  const created = createConsent(database, officer, {
    subjectId: SUBJECT_AKUA,
    authorityId: "auth_akua_self",
    purpose: "COMMUNICATION",
    action: "consent.communication.dispatch",
    resourceCategory: "appointment-reminder",
    recipient: "facility-messenger",
    effectiveAt: "2026-10-14T00:00:00.000Z",
    expiresAt: "2027-10-14T00:00:00.000Z",
    decision: "granted",
    idempotencyKey: key,
  });
  verifyAuthority(database, officer, "auth_akua_self", "evidence_self_ack");
  return activateConsent(database, officer, created.id, created.version);
}

test("P03-F02-S01 an authorized actor records a synthetic consent directive", () => {
  const database = db();
  const created = createConsent(database, officer, {
    subjectId: SUBJECT_AKUA, authorityId: "auth_akua_self", purpose: "COMMUNICATION", action: "consent.communication.dispatch",
    resourceCategory: "appointment-reminder", recipient: "facility-messenger", effectiveAt: "2026-10-14T00:00:00.000Z", expiresAt: null,
    decision: "granted", idempotencyKey: "consent-create-01",
  });
  assert.equal(created.status, "pending_verification");
  assert.equal(created.purpose, "COMMUNICATION");
  assert.equal(created.jurisdiction, "synthetic-development");
});

test("P03-F02-S02 an incomplete consent cannot authorize processing", () => {
  const database = db();
  const created = createConsent(database, officer, {
    subjectId: SUBJECT_AKUA, authorityId: "auth_akua_self", purpose: "COMMUNICATION", action: "consent.communication.dispatch",
    resourceCategory: "appointment-reminder", recipient: "facility-messenger", effectiveAt: "2026-10-14T00:00:00.000Z", expiresAt: null,
    decision: "granted", idempotencyKey: "consent-create-02",
  });
  const decision = evaluateConsent(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", purpose: "COMMUNICATION", recipient: "facility-messenger", resourceCategory: "appointment-reminder" });
  assert.notEqual(created.status, "active");
  assert.equal(decision.result, "deny");
});

test("P03-F02-S03 unverified authority cannot activate consent", () => {
  const database = db();
  const created = createConsent(database, officer, {
    subjectId: SUBJECT_AKUA, authorityId: "auth_akua_self", purpose: "COMMUNICATION", action: "consent.communication.dispatch",
    resourceCategory: "appointment-reminder", recipient: "facility-messenger", effectiveAt: "2026-10-14T00:00:00.000Z", expiresAt: null,
    decision: "granted", idempotencyKey: "consent-create-03",
  });
  assert.throws(() => activateConsent(database, officer, created.id, created.version), ForbiddenError);
});

test("P03-F02-S04 a verified representative can support activation", () => {
  const database = db();
  const created = createConsent(database, officer, {
    subjectId: SUBJECT_AKUA, authorityId: "auth_akua_guardian", purpose: "COMMUNICATION", action: "consent.communication.dispatch",
    resourceCategory: "appointment-reminder", recipient: "facility-messenger", effectiveAt: "2026-10-14T00:00:00.000Z", expiresAt: null,
    decision: "granted", idempotencyKey: "consent-create-04",
  });
  verifyAuthority(database, officer, "auth_akua_guardian", "evidence_guardian_order");
  const active = activateConsent(database, officer, created.id, created.version);
  assert.equal(active.status, "active");
  assert.equal(active.grantor_id, "rep_akua_guardian");
});

test("P03-F02-S05 a forged representative claim fails", () => {
  const database = db();
  assert.throws(() => verifyAuthority(database, officer, "auth_akua_guardian", "surname-match"), ValidationError);
});

test("P03-F02-S06 invalid effective dates are rejected", () => {
  const database = db();
  assert.throws(() => createConsent(database, officer, {
    subjectId: SUBJECT_AKUA, authorityId: "auth_akua_self", purpose: "COMMUNICATION", action: "consent.communication.dispatch",
    resourceCategory: "appointment-reminder", recipient: "facility-messenger", effectiveAt: "2027-01-01T00:00:00.000Z", expiresAt: "2026-01-01T00:00:00.000Z",
    decision: "granted", idempotencyKey: "consent-create-06",
  }), ValidationError);
});

test("P03-F02-S07 through S11 activation is purpose and recipient specific", () => {
  const database = db();
  const active = grant(database, "consent-create-07");
  const allowed = evaluateConsent(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", purpose: "COMMUNICATION", recipient: "facility-messenger", resourceCategory: "appointment-reminder" });
  const research = evaluateConsent(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.research.use", purpose: "RESEARCH", recipient: "research-workspace", resourceCategory: "research-row" });
  const recipient = evaluateConsent(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", purpose: "COMMUNICATION", recipient: "external-registry", resourceCategory: "appointment-reminder" });
  assert.equal(active.status, "active");
  assert.equal(allowed.result, "allow");
  assert.equal(research.reason, "consent-missing");
  assert.equal(recipient.reason, "recipient-scope");
});

test("P03-F02-S08 a permitted reminder can be queued and dispatched locally", () => {
  const database = db();
  grant(database, "consent-create-08");
  const queued = queueConsentDispatch(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", recipient: "facility-messenger", resourceCategory: "appointment-reminder", idempotencyKey: "dispatch-queue-08" });
  const sent = dispatchConsentJob(database, officer, queued.id);
  assert.equal(sent.status, "dispatched");
  const sink = database.prepare("SELECT COUNT(*) AS c FROM consent_sink").get() as { c: number };
  assert.equal(sink.c, 1);
});

test("P03-F02-S12 and S13 cross-organization and cross-facility reuse is denied", () => {
  const database = db();
  grant(database, "consent-create-12");
  database.prepare(
    `INSERT INTO authorization_assignments (id, principal_id, role_id, organization_id, facility_id, assigned_by, assigned_at, status, version) VALUES ('asg_privacy_east', ?, 'privacy-officer', ?, ?, 'seed', '2026-10-14T00:00:00.000Z', 'active', 1)`,
  ).run(PRIVACY_OFFICER, DEMO_GH.organizationId, DEMO_GH.facilities.eastLegon.id);
  const otherOrg = evaluateConsent(database, officer, { subjectId: "sub_eu_synthetic", action: "consent.communication.dispatch", purpose: "COMMUNICATION", recipient: "facility-messenger", resourceCategory: "appointment-reminder" });
  const otherFacility = evaluateConsent(database, { ...officer, facilityId: DEMO_GH.facilities.eastLegon.id }, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", purpose: "COMMUNICATION", recipient: "facility-messenger", resourceCategory: "appointment-reminder" });
  assert.equal(otherOrg.reason, "subject-scope");
  assert.equal(otherFacility.reason, "facility-scope");
});

test("P03-F02-S14 and S15 missing or expired consent fails closed", () => {
  const database = db();
  const missing = evaluateConsent(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.sharing.release", purpose: "SHARING", recipient: "local-share-sink", resourceCategory: "synthetic-record" });
  const active = grant(database, "consent-create-15");
  database.prepare("UPDATE consent_directives SET expires_at = ? WHERE id = ?").run("2020-01-01T00:00:00.000Z", active.id);
  const expired = evaluateConsent(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", purpose: "COMMUNICATION", recipient: "facility-messenger", resourceCategory: "appointment-reminder" });
  assert.equal(missing.result, "deny");
  assert.equal(expired.reason, "consent-expired");
});

test("P03-F02-S16 consent does not override an RBAC denial", () => {
  const database = db();
  grant(database, "consent-create-16");
  const decision = authorize(database, { principalId: doctor.userId, accountActive: true }, "consent.communication.dispatch", { type: "appointment-reminder", id: SUBJECT_AKUA, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sensitivity: "standard" }, { purpose: "TREATMENT", assurance: "directory", sessionActive: true, activeFacilityId: doctor.facilityId, sessionId: doctor.sessionId });
  assert.equal(decision.allow, false);
  assert.equal(decision.reason, "permission");
});

test("P03-F02-S17 through S22 withdrawal blocks new sharing, communication, and research", () => {
  const database = db();
  const active = grant(database, "consent-create-17");
  const queued = queueConsentDispatch(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", recipient: "facility-messenger", resourceCategory: "appointment-reminder", idempotencyKey: "dispatch-queue-19" });
  const withdrawn = withdrawConsent(database, officer, active.id, active.version, "withdraw-once-017");
  const again = withdrawConsent(database, officer, active.id, withdrawn.version, "withdraw-once-017");
  const third = withdrawConsent(database, officer, active.id, withdrawn.version, "withdraw-other-021");
  const blocked = dispatchConsentJob(database, officer, queued.id);
  const sharing = evaluateConsent(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.sharing.release", purpose: "SHARING", recipient: "local-share-sink", resourceCategory: "synthetic-record" });
  const research = evaluateConsent(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.research.use", purpose: "RESEARCH", recipient: "research-workspace", resourceCategory: "research-row" });
  assert.equal(withdrawn.status, "withdrawn");
  assert.equal(again.idempotent, true);
  assert.equal(third.idempotent, true);
  assert.equal(blocked.status, "blocked");
  assert.equal(sharing.result, "deny");
  assert.equal(research.result, "deny");
  assert.throws(() => activateConsent(database, officer, active.id, withdrawn.version), ConflictError);
});

test("P03-F02-S23 a stale version conflicts", () => {
  const database = db();
  const created = createConsent(database, officer, {
    subjectId: SUBJECT_AKUA, authorityId: "auth_akua_self", purpose: "COMMUNICATION", action: "consent.communication.dispatch",
    resourceCategory: "appointment-reminder", recipient: "facility-messenger", effectiveAt: "2026-10-14T00:00:00.000Z", expiresAt: null,
    decision: "granted", idempotencyKey: "consent-create-23",
  });
  verifyAuthority(database, officer, "auth_akua_self", "evidence_self_ack");
  assert.throws(() => activateConsent(database, officer, created.id, created.version + 9), ConflictError);
});

test("P03-F02-S24 a stale cache cannot reauthorize a withdrawn consent", () => {
  const database = db();
  const active = grant(database, "consent-create-24");
  withdrawConsent(database, officer, active.id, active.version, "withdraw-cache-024");
  database.prepare("INSERT INTO consent_cache (cache_key, directive_version, result, reason_code) VALUES (?, 1, 'allow', 'consent-granted')").run(`${DEMO_GH.organizationId}|${SUBJECT_AKUA}|consent.communication.dispatch|COMMUNICATION|facility-messenger`);
  const decision = evaluateConsent(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", purpose: "COMMUNICATION", recipient: "facility-messenger", resourceCategory: "appointment-reminder" });
  assert.equal(decision.reason, "consent-withdrawn");
});

test("P03-F02-S25 history stays sealed and attributable", () => {
  const database = db();
  const active = grant(database, "consent-create-25");
  withdrawConsent(database, officer, active.id, active.version, "withdraw-history-025");
  const history = consentHistory(database, auditor, active.id);
  assert.equal(history.some((item) => item.change_code === "activated"), true);
  assert.equal(history.some((item) => item.change_code === "withdrawn"), true);
  assert.throws(() => database.prepare("DELETE FROM consent_versions WHERE consent_id = ?").run(active.id), /consent-history-sealed/);
});

test("P03-F02-S26 and S27 unauthorized staff and tampered subjects are denied", () => {
  const database = db();
  const active = grant(database, "consent-create-26");
  assert.throws(() => withdrawConsent(database, reception, active.id, active.version, "withdraw-denied-026"), ForbiddenError);
  assert.throws(() => withdrawConsent(database, doctor, active.id, active.version, "withdraw-denied-027"), ForbiddenError);
  const tampered = evaluateConsent(database, officer, { subjectId: "sub_other_person", action: "consent.communication.dispatch", purpose: "COMMUNICATION", recipient: "facility-messenger", resourceCategory: "appointment-reminder" });
  assert.equal(tampered.reason, "subject-scope");
});

test("P03-F02-S28 a consent store outage blocks required processing", () => {
  const database = db();
  grant(database, "consent-create-28");
  setConsentDependency(database, "unavailable");
  const decision = evaluateConsent(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", purpose: "COMMUNICATION", recipient: "facility-messenger", resourceCategory: "appointment-reminder" });
  assert.equal(decision.result, "error");
  assert.throws(() => queueConsentDispatch(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", recipient: "facility-messenger", resourceCategory: "appointment-reminder", idempotencyKey: "dispatch-outage-28" }), ConflictError);
  setConsentDependency(database, "available");
});

test("P03-F02-S29 withdrawal survives a restart", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "curasphere-consent-"));
  const file = path.join(dir, "chart.sqlite");
  const database = createDatabase(file);
  seed(database);
  seedDemoTenants(database);
  const active = grant(database, "consent-create-29");
  withdrawConsent(database, officer, active.id, active.version, "withdraw-restart-029");
  database.close();
  const reopened = createDatabase(file);
  const decision = evaluateConsent(reopened, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", purpose: "COMMUNICATION", recipient: "facility-messenger", resourceCategory: "appointment-reminder" });
  assert.equal(decision.reason, "consent-withdrawn");
  reopened.close();
});

test("P03-F02-S30 and S31 the ledger records consent changes without the subject name", () => {
  const database = db();
  const active = grant(database, "consent-create-30");
  withdrawConsent(database, officer, active.id, active.version, "withdraw-ledger-030");
  assert.equal(verifyAccessLedger(database, DEMO_GH.organizationId).intact, true);
  const stored = JSON.stringify(database.prepare("SELECT * FROM access_ledger").all());
  assert.equal(stored.includes("consent.withdraw"), true);
  assert.equal(stored.includes("Akua Boateng"), false);
});

test("P03-F02-S32 production mode blocks consent-dependent dispatch", () => {
  const database = db();
  grant(database, "consent-create-32");
  const previous = process.env.CURASPHERE_ENV;
  process.env.CURASPHERE_ENV = "production";
  try {
    assert.throws(() => queueConsentDispatch(database, officer, { subjectId: SUBJECT_AKUA, action: "consent.communication.dispatch", recipient: "facility-messenger", resourceCategory: "appointment-reminder", idempotencyKey: "dispatch-prod-32" }), ForbiddenError);
  } finally {
    if (previous === undefined) delete process.env.CURASPHERE_ENV;
    else process.env.CURASPHERE_ENV = previous;
  }
});

test("P03-F02 schema rollback returns to version 33 and the next open upgrades", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "curasphere-consent-rollback-"));
  const file = path.join(dir, "chart.sqlite");
  const database = createDatabase(file);
  database.exec(CONSENT_ROLLBACK);
  const rolled = database.prepare("SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1").get() as { version: number };
  assert.equal(rolled.version, 33);
  database.close();
  const upgraded = createDatabase(file);
  assert.equal(healthcheck(upgraded).schemaVersion, 43);
  upgraded.close();
});
