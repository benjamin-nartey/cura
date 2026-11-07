import { CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK } from "../src/code-system-schema.ts";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { verifyAccessLedger } from "../src/access-ledger.ts";
import { healthcheck } from "../src/chart.ts";
import { createConsent, installConsentGate, PRIVACY_OFFICER, SUBJECT_AKUA, verifyAuthority, withdrawConsent, activateConsent } from "../src/consent.ts";
import { createDatabase } from "../src/db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/errors.ts";
import {
  activateLegalHold,
  createDryRun,
  createLegalHold,
  createRetentionRecord,
  evaluateRetention,
  executeDryRun,
  LEGAL_HOLD_ADMIN,
  listLegalHolds,
  readLegalHold,
  readRetentionRecord,
  RECORDS_MANAGER,
  reconcileRetentionRestore,
  releaseLegalHold,
  resumeRetentionJob,
  RETENTION_ROLLBACK,
  setArchiveDependency,
  setRetentionClock,
  setRetentionDependency,
  updateRetentionPolicy,
} from "../src/retention.ts";
import { seed } from "../src/seed.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";

installConsentGate();
process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";

const records = { userId: RECORDS_MANAGER, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_records" };
const legal = { userId: LEGAL_HOLD_ADMIN, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_legal" };
const privacy = { userId: PRIVACY_OFFICER, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_privacy" };
const auditor = { userId: "usr_gh_reviewer", organizationId: DEMO_GH.organizationId, facilityId: null as string | null, sessionId: "ses_auditor" };
const reception = { userId: DEMO_GH.users.reception, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_reception" };
const doctor = { userId: DEMO_GH.users.doctor, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_doctor" };
const START = "2026-10-01T00:00:00.000Z";
const CLOCK = "2026-10-14T00:00:00.000Z";

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  setRetentionClock(database, CLOCK);
  return database;
}

function record(database: ReturnType<typeof db>, key: string, category = "temporary-admin", retentionStart = START) {
  return createRetentionRecord(database, records, { category, retentionStart, idempotencyKey: key });
}

function holdOn(database: ReturnType<typeof db>, resourceId: string, key: string) {
  const created = createLegalHold(database, legal, { matterRef: "SYN-RETENTION-CASE-001", scopeKind: "resource", scopeRef: resourceId, reasonCode: "investigation", authorityRef: "synthetic-development-authority", idempotencyKey: key });
  return activateLegalHold(database, legal, created.id, 1);
}

test("P03-F03-S01 S06 S07 and S08 policy resolution expiry and invalid periods", () => {
  const database = db();
  const row = record(database, "retpolicy01");
  const decision = evaluateRetention(database, records, { resourceType: row.category, resourceId: row.id });
  assert.equal(decision.decision, "purge_eligible");
  assert.equal(decision.jurisdiction, "SYNTHETIC_GH");
  assert.equal(decision.approvalState, "pending_policy_approval");
  const future = record(database, "retfuture01", "temporary-admin", "2026-11-01T00:00:00.000Z");
  assert.equal(evaluateRetention(database, records, { resourceType: future.category, resourceId: future.id }).reason, "not-expired");
  setRetentionClock(database, "2026-10-01T12:00:00.000Z");
  assert.equal(evaluateRetention(database, records, { resourceType: row.category, resourceId: row.id }).reason, "not-expired");
  setRetentionClock(database, CLOCK);
  assert.throws(() => updateRetentionPolicy(database, privacy, "pol_syn_gh_temp", { duration: 0, durationUnit: "day", expectedVersion: 1 }), ValidationError);
});

test("P03-F03-S02 S03 and S04 missing conflict and jurisdiction isolation", () => {
  const database = db();
  database.prepare(`INSERT INTO retention_records (id, organization_id, facility_id, category, lifecycle_status, version, retention_start, payload_hash, created_at, updated_at) VALUES ('ret_missing_02', ?, ?, 'unclassified', 'active', 1, ?, 'hash', ?, ?)`).run(DEMO_GH.organizationId, DEMO_GH.facilities.accra.id, START, CLOCK, CLOCK);
  assert.equal(evaluateRetention(database, records, { resourceType: "unclassified", resourceId: "ret_missing_02" }).decision, "policy_missing");
  database.prepare(`INSERT INTO retention_policies (id, organization_id, facility_id, jurisdiction, category, classification, trigger_event, duration, duration_unit, expiry_action, approval_state, status, version, effective_at, created_at, updated_at) VALUES ('pol_conflict', ?, NULL, 'SYNTHETIC_GH', 'temporary-admin', 'synthetic', 'record-created', 1, 'day', 'dispose', 'pending_policy_approval', 'active', 1, ?, ?, ?)`).run(DEMO_GH.organizationId, CLOCK, CLOCK, CLOCK);
  const row = record(database, "retconflict3");
  assert.equal(evaluateRetention(database, records, { resourceType: row.category, resourceId: row.id }).decision, "policy_conflict");
  database.prepare(`INSERT INTO authorization_assignments (id, principal_id, role_id, organization_id, facility_id, assigned_by, assigned_at, status, version) VALUES ('asg_eu_records', ?, 'records-manager', ?, ?, 'test', ?, 'active', 1)`).run(DEMO_EU.users.admin, DEMO_EU.organizationId, DEMO_EU.facilities.northbridge.id, CLOCK);
  const eu = { userId: DEMO_EU.users.admin, organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, sessionId: "ses_eu_records" };
  const euRow = createRetentionRecord(database, eu, { category: "temporary-admin", retentionStart: START, idempotencyKey: "reteujuris4" });
  assert.equal(evaluateRetention(database, eu, { resourceType: euRow.category, resourceId: euRow.id }).jurisdiction, "SYNTHETIC_EU");
  assert.throws(() => evaluateRetention(database, eu, { resourceType: row.category, resourceId: row.id }), NotFoundError);
});

test("P03-F03-S05 S12 S18 S22 S23 and S24 preview changes block disposal", () => {
  const database = db();
  const row = record(database, "retpreview05");
  const preview = createDryRun(database, records, "dryrunkey05");
  assert.equal(preview.eligible, 1);
  updateRetentionPolicy(database, privacy, "pol_syn_gh_temp", { duration: 30, durationUnit: "day", expectedVersion: 1 });
  assert.throws(() => executeDryRun(database, records, preview.dryRunId, "executekey05", "dispose"), ConflictError);
  assert.equal(readRetentionRecord(database, records, row.id).lifecycle_status, "active");
  setRetentionClock(database, "2026-12-01T00:00:00.000Z");
  const again = createDryRun(database, records, "dryrunkey05b");
  const disposed = executeDryRun(database, records, again.dryRunId, "executekey05b", "dispose");
  assert.equal(disposed.success, 1);
  assert.throws(() => executeDryRun(database, records, "dry_missing", "executemiss23", "dispose"), NotFoundError);
  const second = record(database, "retstaleplan");
  const stale = createDryRun(database, records, "dryrunstale24");
  database.prepare(`UPDATE retention_dry_runs SET plan_hash = 'tampered' WHERE id = ?`).run(stale.dryRunId);
  assert.throws(() => executeDryRun(database, records, stale.dryRunId, "executestale24", "dispose"), ConflictError);
  assert.equal(readRetentionRecord(database, records, second.id).lifecycle_status, "active");
});

test("P03-F03-S09 through S17 legal holds block and preserve history", () => {
  const database = db();
  const first = record(database, "rethold0009");
  const second = record(database, "rethold0014");
  assert.throws(() => createLegalHold(database, reception, { matterRef: "SYN-RETENTION-CASE-001", scopeKind: "resource", scopeRef: first.id, reasonCode: "investigation", authorityRef: "synthetic-development-authority", idempotencyKey: "holddenied10" }), ForbiddenError);
  const preview = createDryRun(database, records, "dryrunhold12");
  const active = holdOn(database, first.id, "holdactive09");
  assert.equal(evaluateRetention(database, records, { resourceType: first.category, resourceId: first.id }).decision, "hold_blocked");
  assert.throws(() => executeDryRun(database, records, preview.dryRunId, "executehold12", "dispose"), ConflictError);
  assert.equal(readRetentionRecord(database, records, first.id).lifecycle_status, "active");
  const fresh = createDryRun(database, records, "dryrunhold14");
  assert.equal(fresh.held, 1);
  assert.equal(fresh.eligible, 1);
  executeDryRun(database, records, fresh.dryRunId, "executehold14", "dispose");
  assert.equal(readRetentionRecord(database, records, first.id).lifecycle_status, "active");
  assert.throws(() => readRetentionRecord(database, records, second.id), NotFoundError);
  assert.throws(() => releaseLegalHold(database, records, active.id, active.version, "investigation-closed"), ForbiddenError);
  assert.throws(() => releaseLegalHold(database, legal, active.id, active.version, "investigation-closed"), ForbiddenError);
  const released = releaseLegalHold(database, privacy, active.id, active.version, "investigation-closed");
  assert.equal(released.status, "released");
  assert.equal(readLegalHold(database, auditor, active.id).status, "released");
  assert.throws(() => executeDryRun(database, records, fresh.dryRunId, "executeafter18", "dispose"), ConflictError);
  const eu = { userId: DEMO_EU.users.admin, organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, sessionId: "ses_eu_hold" };
  database.prepare(`INSERT INTO authorization_assignments (id, principal_id, role_id, organization_id, facility_id, assigned_by, assigned_at, status, version) VALUES ('asg_eu_legal', ?, 'legal-hold-admin', ?, ?, 'test', ?, 'active', 1)`).run(DEMO_EU.users.admin, DEMO_EU.organizationId, DEMO_EU.facilities.northbridge.id, CLOCK);
  assert.throws(() => readLegalHold(database, eu, active.id), NotFoundError);
  assert.equal(listLegalHolds(database, eu).length, 0);
});

test("P03-F03-S13 a hold created during processing blocks the remaining record", () => {
  const database = db();
  const first = record(database, "retduring1a");
  const second = record(database, "retduring2b");
  const preview = createDryRun(database, records, "dryrunduring1");
  executeDryRun(database, records, preview.dryRunId, "executeduring1", "dispose", {
    beforeItem(resourceId) {
      if (resourceId === second.id) holdOn(database, second.id, "holdduring13");
    },
  });
  assert.throws(() => readRetentionRecord(database, records, first.id), NotFoundError);
  assert.equal(readRetentionRecord(database, records, second.id).lifecycle_status, "active");
  assert.equal(evaluateRetention(database, records, { resourceType: second.category, resourceId: second.id }).decision, "hold_blocked");
});

test("P03-F03-S19 S20 and S21 archive success failure and idempotence", () => {
  const database = db();
  const row = record(database, "retarchive19", "notice-outbox");
  const preview = createDryRun(database, records, "dryrunarchive1");
  setArchiveDependency(database, "unavailable");
  const failed = executeDryRun(database, records, preview.dryRunId, "executearch20", "archive");
  assert.equal(failed.failure, 1);
  assert.equal(readRetentionRecord(database, records, row.id).lifecycle_status, "active");
  setArchiveDependency(database, "available");
  const sent = executeDryRun(database, records, preview.dryRunId, "executearch19", "archive");
  assert.equal(sent.success, 1);
  const again = executeDryRun(database, records, preview.dryRunId, "executearch21", "archive");
  assert.equal(again.success, 0);
  assert.equal((database.prepare(`SELECT COUNT(*) AS c FROM retention_archives`).get() as { c: number }).c, 1);
});

test("P03-F03-S25 S26 and S27 disposal is idempotent and resumable", () => {
  const database = db();
  const first = record(database, "retresume01");
  const second = record(database, "retresume02");
  const preview = createDryRun(database, records, "dryrunresume1");
  assert.throws(() => executeDryRun(database, records, preview.dryRunId, "executeresume", "dispose", {
    beforeItem(resourceId) {
      if (resourceId === second.id) throw new Error("stop");
    },
  }), /stop/);
  assert.throws(() => readRetentionRecord(database, records, first.id), NotFoundError);
  assert.equal(readRetentionRecord(database, records, second.id).lifecycle_status, "active");
  const resumed = resumeRetentionJob(database, records, (database.prepare(`SELECT id FROM retention_jobs WHERE idempotency_key = 'executeresume'`).get() as { id: string }).id);
  assert.equal(resumed.status, "completed");
  assert.throws(() => readRetentionRecord(database, records, second.id), NotFoundError);
  const repeat = executeDryRun(database, records, preview.dryRunId, "executeresume", "dispose");
  assert.equal(repeat.idempotent, true);
  const other = executeDryRun(database, records, preview.dryRunId, "executeresumeb", "dispose");
  assert.equal(other.success, 0);
  assert.equal((database.prepare(`SELECT COUNT(*) AS c FROM retention_tombstones`).get() as { c: number }).c, 2);
});

test("P03-F03-S28 S32 S39 and S40 outage ledger and restore protections", () => {
  const database = db();
  const row = record(database, "retoutage028");
  const preview = createDryRun(database, records, "dryrunoutage28");
  setRetentionDependency(database, "unavailable");
  assert.equal(evaluateRetention(database, records, { resourceType: row.category, resourceId: row.id }).decision, "error");
  assert.throws(() => executeDryRun(database, records, preview.dryRunId, "executeoutage28", "dispose"), ConflictError);
  setRetentionDependency(database, "available");
  assert.equal(evaluateRetention(database, records, { resourceType: "audit-ledger", resourceId: "ledger-row" }).reason, "protected-category");
  assert.throws(() => database.prepare(`DELETE FROM access_ledger`).run(), /ledger-sealed/);
  assert.equal(verifyAccessLedger(database, DEMO_GH.organizationId).intact, true);
  const done = executeDryRun(database, records, preview.dryRunId, "executeoutageok", "dispose");
  assert.equal(done.success, 1);
  database.prepare(`UPDATE retention_records SET lifecycle_status = 'active' WHERE id = ?`).run(row.id);
  assert.equal(reconcileRetentionRestore(database, records).reconciled, 1);
  assert.throws(() => readRetentionRecord(database, records, row.id), NotFoundError);
  const kept = record(database, "retprod040xx");
  const prodPreview = createDryRun(database, records, "dryrunprod040");
  const previous = process.env.CURASPHERE_ENV;
  process.env.CURASPHERE_ENV = "production";
  try {
    assert.throws(() => executeDryRun(database, records, prodPreview.dryRunId, "executeprod040", "dispose"), ForbiddenError);
  } finally {
    if (previous === undefined) delete process.env.CURASPHERE_ENV;
    else process.env.CURASPHERE_ENV = previous;
  }
  assert.equal(readRetentionRecord(database, records, kept.id).lifecycle_status, "active");
  assert.throws(() => executeDryRun(database, doctor, prodPreview.dryRunId, "executedoctor", "dispose"), ForbiddenError);
});

test("P03-F03-S29 S30 S31 and S33 consent and audit evidence stay protected", () => {
  const database = db();
  const created = createConsent(database, privacy, {
    subjectId: SUBJECT_AKUA,
    authorityId: "auth_akua_self",
    purpose: "COMMUNICATION",
    action: "consent.communication.dispatch",
    resourceCategory: "appointment-reminder",
    recipient: "facility-messenger",
    effectiveAt: CLOCK,
    expiresAt: null,
    decision: "granted",
    idempotencyKey: "consentret029",
  });
  verifyAuthority(database, privacy, "auth_akua_self", "evidence_self_ack");
  const active = activateConsent(database, privacy, created.id, created.version);
  withdrawConsent(database, privacy, active.id, active.version, "withdraw-ret-029");
  assert.equal(evaluateRetention(database, records, { resourceType: "consent-history", resourceId: created.id }).reason, "protected-category");
  const status = (database.prepare(`SELECT status FROM consent_directives WHERE id = ?`).get(created.id) as { status: string }).status;
  assert.equal(status, "withdrawn");
  assert.equal((database.prepare(`SELECT COUNT(*) AS c FROM consent_versions WHERE consent_id = ?`).get(created.id) as { c: number }).c >= 2, true);
  assert.equal(verifyAccessLedger(database, DEMO_GH.organizationId).intact, true);
  const stored = JSON.stringify(database.prepare(`SELECT action, resource_id, actor_id FROM access_ledger`).all());
  assert.equal(stored.includes("Akua"), false);
  assert.equal(stored.includes("Adjoa"), false);
  assert.equal(stored.includes("retention") || stored.includes("legal-hold") || stored.includes("consent."), true);
});

test("P03-F03 schema rollback returns to version 34 and the next open upgrades", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "curasphere-retention-"));
  const file = path.join(dir, "chart.sqlite");
  const database = createDatabase(file);
  database.exec(CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK);
  database.exec(RETENTION_ROLLBACK);
  const rolled = database.prepare(`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`).get() as { version: number };
  assert.equal(rolled.version, 34);
  database.close();
  const upgraded = createDatabase(file);
  assert.equal(healthcheck(upgraded).schemaVersion, 63);
  upgraded.close();
});
