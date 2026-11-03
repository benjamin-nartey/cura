import { CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK } from "../src/code-system-schema.ts";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { appendAccessLedger, verifyAccessLedger } from "../src/access-ledger.ts";
import { healthcheck } from "../src/chart.ts";
import { PRIVACY_OFFICER } from "../src/consent.ts";
import { createDatabase } from "../src/db.ts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "../src/errors.ts";
import { GUARDIAN_AUTHORITY, MINOR_SUBJECT, createPrivacyRequest } from "../src/dsar.ts";
import { seed } from "../src/seed.ts";
import {
  acknowledgeAlert,
  emitSafeTelemetry,
  investigateAlert,
  listTelemetryRules,
  proposePolicyDisable,
  proposeRuleChange,
  raiseSignal,
  readPrivacySecurityAlert,
  resolveAlert,
  retryAlertDelivery,
  runCanary,
  sanitizeTelemetry,
  setCollectorHealth,
  setTelemetrySanitizerFailure,
  assertCollectorConfigSafe,
  setTelemetryDependency,
  telemetryOverview,
  TELEMETRY_ROLLBACK,
} from "../src/telemetry.ts";
import { DEMO_EU, DEMO_GH, seedDemoTenants } from "../src/tenancy.ts";

process.env.CURASPHERE_DEV_DIRECTORY ??= "local-test";
const privacy = { userId: PRIVACY_OFFICER, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_tel_privacy" };
const auditor = { userId: "usr_gh_reviewer", organizationId: DEMO_GH.organizationId, facilityId: null as string | null, sessionId: "ses_tel_auditor" };
const reception = { userId: DEMO_GH.users.reception, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.eastLegon.id, sessionId: "ses_tel_reception" };
const admin = { userId: DEMO_GH.users.admin, organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_tel_admin" };

function db() {
  const database = createDatabase(":memory:");
  seed(database);
  seedDemoTenants(database);
  return database;
}

test("P03-F05-S01 through S12 canaries stay out of sanitized telemetry", () => {
  for (const id of ["P03-F05-S01", "P03-F05-S02", "P03-F05-S03", "P03-F05-S04", "P03-F05-S05", "P03-F05-S06", "P03-F05-S07", "P03-F05-S08", "P03-F05-S09", "P03-F05-S10", "P03-F05-S11", "P03-F05-S12"]) {
    const database = db();
    const result = runCanary(database, privacy, id);
    assert.equal(result.passed, true, id);
    const sink = database.prepare(`SELECT body FROM privacy_telemetry_sink`).all() as Array<{ body: string }>;
    assert.equal(sink.some((row) => row.body.includes("syn-canary") || row.body.includes("555-010-0199") || row.body.includes("synthetic-bulk")), false);
    database.close();
  }
  const direct = sanitizeTelemetry({ event: "log", message: "kept", phone: "555-010-0199", nested: { token: "Bearer syn-canary-token" } });
  const encoded = JSON.stringify(direct.event);
  assert.equal(encoded.includes("555-010-0199"), false);
  assert.equal(encoded.includes("syn-canary-token"), false);
  assert.equal(direct.event.traceId ?? direct.event.message, direct.event.message);
  assert.throws(() => assertCollectorConfigSafe("processors:\n  batch:\nallow_all_keys: true\n"), ValidationError);
  assert.doesNotThrow(() => assertCollectorConfigSafe("processors:\n  redaction:\n    allow_all_keys: false\nlog_statements:\n"));
  assertCollectorConfigSafe(readFileSync(new URL("../../../infra/local/otel-collector.yaml", import.meta.url), "utf8"));
});

test("P03-F05-S13 through S20 safe telemetry shape, metrics labels, and failure", () => {
  const database = db();
  const emitted = emitSafeTelemetry(database, privacy, { event: "export.monitor", correlationId: "corr-telemetry-01", traceId: "a".repeat(32), count: 4900, route: "/privacy/exports" });
  assert.equal(emitted.decision, "sanitized");
  assert.equal(emitted.event.correlationId, "corr-telemetry-01");
  assert.equal(emitted.event.traceId, "a".repeat(32));
  const labels = ["method", "route", "status", "category", "severity"];
  assert.equal(labels.includes("subjectId"), false);
  const oversized = sanitizeTelemetry({ message: "y".repeat(5000), event: "log" });
  assert.equal(oversized.decision, "sanitized");
  assert.equal(JSON.stringify(oversized.event).includes("y".repeat(20)), false);
  setTelemetrySanitizerFailure(true);
  try {
    const failed = sanitizeTelemetry({ event: "log", message: "syn-canary-failure" });
    assert.equal(failed.decision, "failed");
    assert.equal(JSON.stringify(failed.event).includes("syn-canary-failure"), false);
  } finally {
    setTelemetrySanitizerFailure(false);
  }
  setCollectorHealth(database, privacy, "disconnected", "collector-unavailable");
  const overview = telemetryOverview(database, privacy);
  assert.equal(overview.health.collector, "disconnected");
  setCollectorHealth(database, privacy, "ready", null);
  assert.equal(telemetryOverview(database, privacy).health.collector, "ready");
  database.close();
});

test("P03-F05-S21 through S30 signals, dedupe, and versioned rules", () => {
  const database = db();
  assert.equal(raiseSignal(database, privacy, "sig.cross-tenant.denied", "tenant-a", 2).created, false);
  const created = raiseSignal(database, privacy, "sig.cross-tenant.denied", "tenant-a", 3);
  assert.equal(created.created, true);
  assert.equal(raiseSignal(database, privacy, "sig.cross-tenant.denied", "tenant-a", 3).reason, "deduped");
  raiseSignal(database, privacy, "sig.session.revoked", "session-1", 1);
  raiseSignal(database, privacy, "sig.emergency.denied", "emergency-1", 3);
  raiseSignal(database, privacy, "sig.export.large", "exp-large", 5000);
  raiseSignal(database, privacy, "sig.export.wrong-subject", "wrong-subject", 1);
  raiseSignal(database, privacy, "sig.consent.withdrawn", "consent-1", 1);
  raiseSignal(database, privacy, "sig.retention.illegal", "retention-1", 1);
  setTelemetrySanitizerFailure(true);
  let failed;
  try {
    failed = emitSafeTelemetry(database, privacy, { message: "syn-canary-failure", event: "log" });
  } finally {
    setTelemetrySanitizerFailure(false);
  }
  assert.equal(failed.decision, "failed");
  const alerts = database.prepare(`SELECT rule_id FROM privacy_security_alerts`).all() as Array<{ rule_id: string }>;
  assert.equal(alerts.some((row) => row.rule_id === "sig.sanitizer.failure"), true);
  assert.equal(JSON.stringify(alerts).includes("syn-canary-failure"), false);
  assert.throws(() => proposeRuleChange(database, privacy, "sig.export.large", 2), ForbiddenError);
  assert.throws(() => proposePolicyDisable(database, admin), ForbiddenError);
  database.prepare(`INSERT INTO authorization_assignments (id, principal_id, role_id, organization_id, facility_id, assigned_by, assigned_at, status, version) VALUES ('asg_tel_rule', ?, 'privacy-engineer', ?, ?, 'test', '2026-10-15T00:00:00.000Z', 'active', 1)`).run(privacy.userId, privacy.organizationId, privacy.facilityId);
  const changed = proposeRuleChange(database, privacy, "sig.export.large", 2);
  assert.equal(changed.version, 2);
  assert.equal(changed.threshold, 2);
  const rules = listTelemetryRules(database, auditor);
  assert.equal(rules.find((rule) => rule.id === "sig.export.large")?.approval_state, "pending_policy_approval");
  database.close();
});

test("P03-F05-S31 through S46 alert access and lifecycle", () => {
  const database = db();
  const alert = raiseSignal(database, privacy, "sig.export.large", "exp-life", 1000);
  assert.equal(alert.created, true);
  if (!alert.created) return;
  assert.equal(alert.status, "delivered");
  assert.throws(() => acknowledgeAlert(database, auditor, alert.id, 1), ForbiddenError);
  assert.throws(() => telemetryOverview(database, reception), ForbiddenError);
  assert.throws(() => telemetryOverview(database, admin), ForbiddenError);
  const eu = { userId: DEMO_EU.users.admin, organizationId: DEMO_EU.organizationId, facilityId: DEMO_EU.facilities.northbridge.id, sessionId: "ses_eu_tel" };
  database.prepare(`INSERT INTO authorization_assignments (id, principal_id, role_id, organization_id, facility_id, assigned_by, assigned_at, status, version) VALUES ('asg_eu_tel', ?, 'privacy-officer', ?, ?, 'test', '2026-10-15T00:00:00.000Z', 'active', 1)`).run(eu.userId, eu.organizationId, eu.facilityId);
  assert.throws(() => acknowledgeAlert(database, eu, alert.id, 1), NotFoundError);
  const acknowledged = acknowledgeAlert(database, privacy, alert.id, 1);
  const investigating = investigateAlert(database, privacy, alert.id, acknowledged.version, "syn-canary-note reviewed");
  const detail = readPrivacySecurityAlert(database, privacy, alert.id);
  assert.equal(JSON.stringify(detail).includes("syn-canary-note"), false);
  assert.throws(() => resolveAlert(database, privacy, alert.id, acknowledged.version, "confirmed"), ConflictError);
  const resolved = resolveAlert(database, privacy, alert.id, investigating.version, "confirmed");
  assert.equal(resolved.status, "resolved");
  assert.equal(readPrivacySecurityAlert(database, auditor, alert.id).events.length >= 3, true);
  setTelemetryDependency(database, "unavailable");
  const failed = raiseSignal(database, privacy, "sig.session.revoked", "session-retry", 1);
  assert.equal(failed.created && failed.status, "delivery_failed");
  if (failed.created) {
    assert.throws(() => retryAlertDelivery(database, privacy, failed.id, 1), ConflictError);
    setTelemetryDependency(database, "available");
    assert.equal(retryAlertDelivery(database, privacy, failed.id, 1).status, "delivered");
  }
  database.close();
  const file = path.join(mkdtempSync(path.join(tmpdir(), "curasphere-tel-")), "chart.sqlite");
  const first = createDatabase(file);
  seed(first);
  seedDemoTenants(first);
  const stored = raiseSignal(first, privacy, "sig.export.large", "exp-restart", 1000);
  first.close();
  const persisted = createDatabase(file);
  const row = persisted.prepare(`SELECT status FROM privacy_security_alerts WHERE source_ref = 'exp-restart'`).get() as { status: string };
  assert.equal(row.status, stored.created ? "delivered" : row.status);
  persisted.exec(CODE_SYSTEM_REGISTRY_FIXTURE_ROLLBACK);
  persisted.exec(TELEMETRY_ROLLBACK);
  assert.equal((persisted.prepare(`SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`).get() as { version: number }).version, 36);
  persisted.close();
  const upgraded = createDatabase(file);
  assert.equal(healthcheck(upgraded).schemaVersion, 49);
  upgraded.close();
});

test("P03-F05-S47 through S52 prior controls stay in force", () => {
  const database = db();
  assert.throws(() => appendAccessLedger(database, {
    organizationId: privacy.organizationId,
    facilityId: privacy.facilityId,
    actorId: privacy.userId,
    subjectId: null,
    action: "privacy.telemetry.emit",
    resourceType: "PrivacyTelemetry",
    resourceId: "syn-canary-ledger",
    purpose: "AUDIT",
    outcome: "denied",
    correlationId: privacy.sessionId,
    before: null,
    after: null,
  }), ValidationError);
  assert.equal(verifyAccessLedger(database, privacy.organizationId).intact, true);
  assert.throws(() => createPrivacyRequest(database, { userId: "usr_gh_records", organizationId: DEMO_GH.organizationId, facilityId: DEMO_GH.facilities.accra.id, sessionId: "ses_records" }, {
    requestType: "access",
    subjectId: MINOR_SUBJECT,
    relationship: "guardian",
    authorityId: GUARDIAN_AUTHORITY,
    jurisdiction: "SYNTHETIC_GH_DSAR",
    categories: ["administrative-note"],
    idempotencyKey: "teldsar0001",
    clientSubjectId: "sub_namesake_two",
  }), ForbiddenError);
  database.close();
});
