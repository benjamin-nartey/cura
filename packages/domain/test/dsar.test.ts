import { CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK } from "../src/code-system-schema.ts";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyAccessLedger } from "../src/access-ledger.ts";
import { healthcheck } from "../src/chart.ts";
import { activateConsent, createConsent, installConsentGate, PRIVACY_OFFICER, SUBJECT_AKUA, verifyAuthority, withdrawConsent } from "../src/consent.ts";
import { createDatabase } from "../src/db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/errors.ts";
import {
  applyCorrection,
  approvePrivacyRequest,
  BULK_SUBJECT,
  cancelPrivacyRequest,
  cleanupExpiredExports,
  createPrivacyRequest,
  denyPrivacyRequest,
  downloadExport,
  DSAR_ROLLBACK,
  executeErasure,
  GUARDIAN_AUTHORITY,
  MINOR_SUBJECT,
  planErasure,
  queueExport,
  revokeDsarSession,
  revokePrivacyAuthority,
  runExport,
  setDsarClock,
  setDsarDependency,
  setDsarLimit,
  verifyPrivacyRequest,
} from "../src/dsar.ts";
import { activateLegalHold, createLegalHold, LEGAL_HOLD_ADMIN } from "../src/retention.ts";
import { seed } from "../src/seed.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";

installConsentGate();
process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";
const CLOCK = "2026-10-14T00:00:00.000Z";
const records = { userId: "usr_gh_records", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_records" };
const privacy = { userId: PRIVACY_OFFICER, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_privacy" };
const legal = { userId: LEGAL_HOLD_ADMIN, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_legal" };
const auditor = { userId: "usr_gh_reviewer", organizationId: DEMO_GH.organizationId, facilityId: null as string | null, sessionId: "ses_auditor" };
const reception = { userId: DEMO_GH.users.reception, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_reception" };
const doctor = { userId: DEMO_GH.users.doctor, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_doctor" };

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  setDsarClock(database, CLOCK);
  return database;
}

function request(database: ReturnType<typeof db>, key: string, overrides: Partial<Parameters<typeof createPrivacyRequest>[2]> = {}) {
  return createPrivacyRequest(database, records, {
    requestType: "access",
    subjectId: MINOR_SUBJECT,
    relationship: "guardian",
    authorityId: GUARDIAN_AUTHORITY,
    jurisdiction: "SYNTHETIC_GH_DSAR",
    categories: ["administrative-note", "third-party-note", "contact-preference"],
    idempotencyKey: key,
    ...overrides,
  });
}

test("P03-F04-S01 S02 S06 S07 and S26 request creation boundaries", () => {
  const database = db();
  const created = request(database, "dsarcreate01");
  assert.equal(created.status, "verification_pending");
  assert.equal(request(database, "dsarcreate01").idempotent, true);
  assert.throws(() => request(database, "dsarinvalid02", { requestType: "broadcast" }), ValidationError);
  assert.throws(() => request(database, "dsarclient47", { clientSubjectId: "sub_namesake_two" }), ForbiddenError);
  const unknown = request(database, "dsarpolicy26", { jurisdiction: "UNKNOWN" });
  assert.equal(unknown.status, "policy_review_required");
  assert.throws(() => verifyPrivacyRequest(database, privacy, created.id, { method: "email-match", authorityId: null, email: "ada@example.invalid", expectedVersion: 1 }), ForbiddenError);
  assert.throws(() => approvePrivacyRequest(database, privacy, unknown.id, 1, "full"), ConflictError);
});

test("P03-F04-S03 S04 S05 S09 S10 S11 and S12 verification and approval", () => {
  const database = db();
  const created = request(database, "dsarverify04");
  assert.throws(() => queueExport(database, privacy, created.id, "exportbefore3"), ConflictError);
  assert.throws(() => verifyPrivacyRequest(database, privacy, created.id, { method: "synthetic-authority", authorityId: "auth_guardian_wrong", expectedVersion: 1 }), ForbiddenError);
  assert.throws(() => verifyPrivacyRequest(database, privacy, created.id, { method: "synthetic-authority", authorityId: "auth_guardian_expired", expectedVersion: 1 }), ForbiddenError);
  const verified = verifyPrivacyRequest(database, privacy, created.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 1 });
  assert.equal(verified.status, "verified");
  assert.throws(() => approvePrivacyRequest(database, reception, created.id, verified.version, "full"), ForbiddenError);
  const own = request(database, "dsarself12");
  const ownVerified = verifyPrivacyRequest(database, privacy, own.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 1 });
  database.prepare(`UPDATE privacy_requests SET requester_id = ? WHERE id = ?`).run(privacy.userId, own.id);
  assert.throws(() => approvePrivacyRequest(database, privacy, own.id, ownVerified.version, "full"), ForbiddenError);
  const approved = approvePrivacyRequest(database, privacy, created.id, verified.version, "full");
  assert.equal(approved.status, "approved");
});

test("P03-F04-S08 S13 S14 S15 S16 S45 and S46 isolation and denial", () => {
  const database = db();
  const created = request(database, "dsarisol08");
  const eu = { userId: DEMO_EU.users.admin, organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, sessionId: "ses_eu_dsar" };
  database.prepare(`INSERT INTO authorization_assignments (id, principal_id, role_id, organization_id, facility_id, assigned_by, assigned_at, status, version) VALUES ('asg_eu_dsar', ?, 'privacy-officer', ?, ?, 'test', ?, 'active', 1)`).run(eu.userId, eu.organizationId, eu.facilityId, CLOCK);
  assert.throws(() => verifyPrivacyRequest(database, eu, created.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 1 }), NotFoundError);
  const verified = verifyPrivacyRequest(database, privacy, created.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 1 });
  const first = approvePrivacyRequest(database, privacy, created.id, verified.version, "partial");
  assert.equal(first.status, "partially_approved");
  assert.throws(() => approvePrivacyRequest(database, legal, created.id, verified.version, "full"), ConflictError);
  const stored = database.prepare(`SELECT approved_categories FROM privacy_requests WHERE id = ?`).get(created.id) as { approved_categories: string };
  assert.equal(stored.approved_categories.includes("third-party-note"), false);
  assert.equal(stored.approved_categories.includes("research-note"), false);
  const denied = request(database, "dsardeny14");
  const deniedVerified = verifyPrivacyRequest(database, privacy, denied.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 1 });
  denyPrivacyRequest(database, privacy, denied.id, deniedVerified.version, "out-of-scope");
  assert.throws(() => queueExport(database, privacy, denied.id, "exportdeny14"), ConflictError);
  assert.throws(() => createPrivacyRequest(database, reception, { requestType: "access", subjectId: MINOR_SUBJECT, relationship: "guardian", authorityId: GUARDIAN_AUTHORITY, jurisdiction: "SYNTHETIC_GH_DSAR", categories: ["administrative-note"], idempotencyKey: "dsarrecept45" }), ForbiddenError);
  database.prepare(`INSERT INTO authorization_assignments (id, principal_id, role_id, organization_id, facility_id, assigned_by, assigned_at, status, version) VALUES ('asg_east_dsar', ?, 'privacy-officer', ?, ?, 'test', ?, 'active', 1)`).run(reception.userId, DEMO_GH.organizationId, DEMO_GH.facilities.eastLegon.id, CLOCK);
  assert.throws(() => verifyPrivacyRequest(database, { ...reception, sessionId: "ses_east_read" }, created.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 2 }), NotFoundError);
});

test("P03-F04-S17 S18 S19 S20 S21 S22 S23 S24 and S34 scoped export delivery", () => {
  const database = db();
  const created = request(database, "dsarexport17");
  const verified = verifyPrivacyRequest(database, privacy, created.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 1 });
  approvePrivacyRequest(database, privacy, created.id, verified.version, "full");
  assert.throws(() => queueExport(database, privacy, created.id, "exportwrong18", "sub_namesake_two"), ForbiddenError);
  assert.equal(database.prepare(`SELECT COUNT(*) AS c FROM privacy_exports`).get() && (database.prepare(`SELECT COUNT(*) AS c FROM privacy_exports`).get() as { c: number }).c, 0);
  const queued = queueExport(database, privacy, created.id, "exportok17");
  const ran = runExport(database, privacy, queued.id);
  assert.equal(ran.status, "ready");
  const artifact = database.prepare(`SELECT payload, checksum FROM privacy_artifacts WHERE export_id = ?`).get(queued.id) as { payload: string; checksum: string };
  assert.equal(createHash("sha256").update(artifact.payload).digest("hex"), artifact.checksum);
  const body = JSON.parse(artifact.payload) as { subjectId: string; records: Array<{ id: string; payload: string }> };
  assert.equal(body.subjectId, MINOR_SUBJECT);
  assert.equal(body.records.some((row) => row.id === "prv_namesake_two" || row.id.startsWith("prv_eu")), false);
  assert.equal(body.records.some((row) => row.id === "prv_minor_held"), false);
  assert.equal(body.records.find((row) => row.id === "prv_minor_third")?.payload, "[redacted]");
  const downloaded = downloadExport(database, records, queued.id);
  assert.equal(downloaded.count, body.records.length);
  assert.throws(() => downloadExport(database, legal, queued.id), ForbiddenError);
  revokePrivacyAuthority(database, GUARDIAN_AUTHORITY);
  assert.throws(() => downloadExport(database, records, queued.id), ForbiddenError);
  database.prepare(`UPDATE privacy_authorities SET status = 'active' WHERE id = ?`).run(GUARDIAN_AUTHORITY);
  database.prepare(`UPDATE privacy_artifacts SET checksum = 'tampered' WHERE export_id = ?`).run(queued.id);
  assert.throws(() => downloadExport(database, records, queued.id), ConflictError);
  database.prepare(`UPDATE privacy_artifacts SET checksum = ? WHERE export_id = ?`).run(artifact.checksum, queued.id);
  setDsarClock(database, "2026-10-15T00:00:00.000Z");
  assert.throws(() => downloadExport(database, records, queued.id), ConflictError);
});

test("P03-F04-S25 S27 S28 S29 S30 S31 S32 S33 and S35 bulk monitoring and recovery", () => {
  const database = db();
  const created = request(database, "dsarbulk27", { requestType: "bulk", subjectId: BULK_SUBJECT, relationship: "staff-prepared", authorityId: "auth_bulk_scope", jurisdiction: "SYNTHETIC_BULK_EXPORT", categories: ["administrative-note", "third-party-note", "research-note"] });
  const verified = verifyPrivacyRequest(database, privacy, created.id, { method: "synthetic-authority", authorityId: "auth_bulk_scope", expectedVersion: 1 });
  const elevated = approvePrivacyRequest(database, privacy, created.id, verified.version, "full");
  assert.equal(elevated.status, "elevated_review");
  assert.ok(elevated.estimate >= 5000);
  assert.throws(() => queueExport(database, privacy, created.id, "exportbulkearly"), ConflictError);
  assert.throws(() => approvePrivacyRequest(database, privacy, created.id, elevated.version, "full"), ForbiddenError);
  const approved = approvePrivacyRequest(database, legal, created.id, elevated.version, "full");
  assert.equal(approved.status, "approved");
  const queued = queueExport(database, privacy, created.id, "exportbulk27");
  assert.equal(queued.monitoring, "large");
  assert.equal(queueExport(database, privacy, created.id, "exportbulk27").idempotent, true);
  assert.throws(() => runExport(database, privacy, queued.id, { beforeBatch: () => { throw new Error("stop-batch"); } }), /stop-batch/);
  const resumed = runExport(database, privacy, queued.id);
  assert.equal(resumed.status, "ready");
  assert.ok((resumed.count ?? 0) >= 4800);
  const other = { ...privacy, sessionId: "ses_other_worker" };
  database.prepare(`UPDATE privacy_exports SET status = 'running', worker_token = 'someone-else' WHERE id = ?`).run(queued.id);
  const raced = runExport(database, other, queued.id);
  assert.equal(raced.claimed, false);
  database.prepare(`UPDATE privacy_exports SET status = 'ready', worker_token = NULL WHERE id = ?`).run(queued.id);
  setDsarDependency(database, "unavailable");
  assert.throws(() => queueExport(database, privacy, created.id, "exportout33"), ConflictError);
  setDsarDependency(database, "available");
  const alerts = database.prepare(`SELECT kind FROM privacy_alerts`).all() as Array<{ kind: string }>;
  assert.equal(alerts.some((row) => row.kind === "large-export-requested"), true);
  assert.equal(alerts.some((row) => row.kind === "large-export-completed"), true);
  const cancelled = request(database, "dsarcancel25");
  const cancelVerified = verifyPrivacyRequest(database, privacy, cancelled.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 1 });
  approvePrivacyRequest(database, privacy, cancelled.id, cancelVerified.version, "full");
  const cancelQueued = queueExport(database, privacy, cancelled.id, "exportcancel25");
  cancelPrivacyRequest(database, records, cancelled.id, cancelVerified.version + 1);
  assert.throws(() => runExport(database, privacy, cancelQueued.id), ConflictError);
  const overflow = request(database, "dsaroverflow35", { requestType: "bulk", subjectId: BULK_SUBJECT, relationship: "staff-prepared", authorityId: "auth_bulk_scope", jurisdiction: "SYNTHETIC_BULK_EXPORT", categories: ["administrative-note"] });
  const overflowVerified = verifyPrivacyRequest(database, privacy, overflow.id, { method: "synthetic-authority", authorityId: "auth_bulk_scope", expectedVersion: 1 });
  const overflowElevated = approvePrivacyRequest(database, privacy, overflow.id, overflowVerified.version, "full");
  approvePrivacyRequest(database, legal, overflow.id, overflowElevated.version, "full");
  setDsarLimit(database, 10);
  const overflowQueued = queueExport(database, privacy, overflow.id, "exportoverflow35");
  const blocked = runExport(database, privacy, overflowQueued.id);
  assert.equal(blocked.status, "blocked");
  assert.throws(() => downloadExport(database, records, overflowQueued.id), ForbiddenError);
});

test("P03-F04-S36 S37 S38 S39 S40 S41 S42 S43 and S44 correction erasure and consent", () => {
  const database = db();
  const correction = request(database, "dsarcorrect36", { requestType: "correction", categories: ["contact-preference"], correctionField: "preference", correctionValue: "morning" });
  const correctionVerified = verifyPrivacyRequest(database, privacy, correction.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 1 });
  approvePrivacyRequest(database, privacy, correction.id, correctionVerified.version, "full");
  assert.throws(() => applyCorrection(database, reception, correction.id), ForbiddenError);
  assert.throws(() => applyCorrection(database, doctor, correction.id), ForbiddenError);
  const applied = applyCorrection(database, privacy, correction.id);
  assert.equal(applied.previous, "window");
  assert.equal((database.prepare(`SELECT payload, version FROM privacy_records WHERE id = ?`).get(applied.recordId) as { payload: string; version: number }).payload, "morning");
  assert.equal((database.prepare(`SELECT COUNT(*) AS c FROM privacy_record_versions WHERE record_id = ?`).get(applied.recordId) as { c: number }).c, 1);
  const erasure = request(database, "dsarerase39", { requestType: "erasure", categories: ["administrative-note", "contact-preference"] });
  const erasureVerified = verifyPrivacyRequest(database, privacy, erasure.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 1 });
  approvePrivacyRequest(database, privacy, erasure.id, erasureVerified.version, "full");
  const hold = createLegalHold(database, legal, { matterRef: "SYN-RETENTION-CASE-001", scopeKind: "category", scopeRef: "administrative-note", reasonCode: "investigation", authorityRef: "synthetic-development-authority", idempotencyKey: "holderase40" });
  activateLegalHold(database, legal, hold.id, 1);
  const plan = planErasure(database, privacy, erasure.id);
  assert.ok(plan.blocked >= 1);
  const executed = executeErasure(database, privacy, erasure.id, plan.id);
  assert.equal(executed.outcome, "partial");
  assert.equal(executed.retainedCopies, "archive-and-backup-not-verified");
  assert.equal((database.prepare(`SELECT lifecycle_status FROM privacy_records WHERE id = 'prv_minor_note'`).get() as { lifecycle_status: string }).lifecycle_status, "active");
  assert.equal((database.prepare(`SELECT lifecycle_status FROM privacy_records WHERE id = 'prv_minor_held'`).get() as { lifecycle_status: string }).lifecycle_status, "active");
  assert.throws(() => database.prepare(`DELETE FROM access_ledger`).run(), /ledger-sealed/);
  assert.equal(verifyAccessLedger(database, DEMO_GH.organizationId).intact, true);
  const consent = createConsent(database, privacy, { subjectId: SUBJECT_AKUA, authorityId: "auth_akua_self", purpose: "COMMUNICATION", action: "consent.communication.dispatch", resourceCategory: "appointment-reminder", recipient: "facility-messenger", effectiveAt: CLOCK, expiresAt: null, decision: "granted", idempotencyKey: "dsarconsent43" });
  verifyAuthority(database, privacy, "auth_akua_self", "evidence_self_ack");
  const active = activateConsent(database, privacy, consent.id, consent.version);
  withdrawConsent(database, privacy, active.id, active.version, "dsar-withdraw");
  assert.equal((database.prepare(`SELECT status FROM consent_directives WHERE id = ?`).get(consent.id) as { status: string }).status, "withdrawn");
  const stored = JSON.stringify(database.prepare(`SELECT action, resource_id FROM access_ledger`).all());
  assert.equal(stored.includes("synthetic-admin-note"), false);
  assert.equal(stored.includes("synthetic-third-party"), false);
});

test("P03-F04-S49 S50 S51 and schema rollback", () => {
  const database = db();
  const created = request(database, "dsardown49");
  const verified = verifyPrivacyRequest(database, privacy, created.id, { method: "synthetic-authority", authorityId: GUARDIAN_AUTHORITY, expectedVersion: 1 });
  approvePrivacyRequest(database, privacy, created.id, verified.version, "full");
  const queued = queueExport(database, privacy, created.id, "exportdown49");
  runExport(database, privacy, queued.id);
  assert.throws(() => downloadExport(database, doctor, queued.id), ForbiddenError);
  const denied = database.prepare(`SELECT outcome FROM access_ledger WHERE action = 'privacy.download' AND outcome = 'denied'`).get() as { outcome: string };
  assert.equal(denied.outcome, "denied");
  revokeDsarSession(database, records.sessionId);
  assert.throws(() => downloadExport(database, records, queued.id), ForbiddenError);
  const previous = process.env.CURASPHERE_ENV;
  process.env.CURASPHERE_ENV = "production";
  try {
    assert.throws(() => runExport(database, privacy, queued.id), ForbiddenError);
  } finally {
    if (previous === undefined) delete process.env.CURASPHERE_ENV;
    else process.env.CURASPHERE_ENV = previous;
  }
  setDsarClock(database, "2026-10-16T00:00:00.000Z");
  const cleaned = cleanupExpiredExports(database, privacy);
  assert.ok(cleaned.cleaned >= 1);
  assert.equal((database.prepare(`SELECT access_state FROM privacy_artifacts WHERE export_id = ?`).get(queued.id) as { access_state: string }).access_state, "cleaned");
  database.exec(CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK);
  database.exec(DSAR_ROLLBACK);
  assert.equal((database.prepare(`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`).get() as { version: number }).version, 35);
  database.close();
  const file = path.join(mkdtempSync(path.join(tmpdir(), "curasphere-dsar-")), "chart.sqlite");
  const fresh = createDatabase(file);
  fresh.exec(CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK);
  fresh.exec(DSAR_ROLLBACK);
  fresh.close();
  const upgraded = createDatabase(file);
  assert.equal(healthcheck(upgraded).schemaVersion, 63);
  upgraded.close();
});
