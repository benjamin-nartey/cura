import { randomUUID } from "node:crypto";
import { appendAccessLedger } from "./access-ledger";
import { effectivePermissions } from "./authorization";
import type { AppDatabase } from "./db";
import { all, get, run } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";

export const TELEMETRY_POLICY = "pol_telemetry_synthetic";
const POLICY_VERSION = 1;
const MAX_BYTES = 4000;

type Actor = { userId: string; organizationId: string; facilityId: string | null; sessionId: string };

const ALLOWED = new Set([
  "event", "level", "service", "message", "route", "method", "status", "correlationId", "traceId", "spanId",
  "policyVersion", "decision", "organizationId", "facilityId", "actorId", "ruleId", "severity", "category",
  "count", "durationMs", "environment", "redacted", "dropped", "alertId", "outcome", "schemaVersion", "http.route",
  "http.method", "http.status_code", "correlation.id", "service.name",
]);

const SENSITIVE_KEY = /(note|phone|email|token|authorization|cookie|password|secret|otp|justification|payload|body|prompt|query|stack|subject|credential|session)/i;
const SENSITIVE_VALUE = /bearer\s+\S+|syn-canary-|@[^\s]+\.invalid|\b\d{3}-\d{3}-\d{4}\b|cura_session=|code=|synthetic-bulk-/i;
const URL_QUERY = /^https?:\/\/\S+\?\S+/i;

export type SanitizeResult = {
  event: Record<string, unknown>;
  policyVersion: number;
  redacted: number;
  dropped: number;
  categories: string[];
  decision: "sanitized" | "failed";
};

let forceFailure = false;

export function assertCollectorConfigSafe(yaml: string) {
  if (!yaml.includes("redaction:") || !yaml.includes("log_statements:") || /allow_all_keys:\s*true/.test(yaml)) {
    throw new ValidationError("invalid", "That collector configuration is not allowed.");
  }
}

export function setTelemetrySanitizerFailure(value: boolean) {
  forceFailure = value;
}

export function sanitizeTelemetry(input: unknown): SanitizeResult {
  try {
    if (forceFailure) throw new Error("sanitizer-disabled-for-test");
    const categories = new Set<string>();
    let redacted = 0;
    let dropped = 0;
    const event = walk(input, categories, (kind) => {
      if (kind === "redacted") redacted += 1;
      else dropped += 1;
    });
    const encoded = JSON.stringify(event);
    if (encoded.length > MAX_BYTES) {
      return failed("oversized");
    }
    return { event: event as Record<string, unknown>, policyVersion: POLICY_VERSION, redacted, dropped, categories: [...categories], decision: "sanitized" };
  } catch {
    return failed("sanitizer-error");
  }
}

function failed(category: string): SanitizeResult {
  return {
    event: { event: "telemetry.sanitizer.failed", category, policyVersion: POLICY_VERSION },
    policyVersion: POLICY_VERSION,
    redacted: 0,
    dropped: 0,
    categories: [category],
    decision: "failed",
  };
}

function walk(value: unknown, categories: Set<string>, count: (kind: "redacted" | "dropped") => void): unknown {
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => walk(item, categories, count));
  if (value && typeof value === "object") {
    const output: Record<string, unknown> = {};
    for (const [childKey, child] of Object.entries(value as Record<string, unknown>)) {
      if (!ALLOWED.has(childKey) || SENSITIVE_KEY.test(childKey)) {
        categories.add("dropped-field");
        count("dropped");
        continue;
      }
      output[childKey] = walk(child, categories, count);
    }
    return output;
  }
  if (typeof value === "string") {
    if (URL_QUERY.test(value) || SENSITIVE_VALUE.test(value) || /[\r\n]/.test(value)) {
      categories.add("redacted-value");
      count("redacted");
      return "[REDACTED]";
    }
    if (value.length > 160) {
      categories.add("truncated");
      count("redacted");
      return "[REDACTED]";
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean" || value == null) return value;
  categories.add("dropped-field");
  count("dropped");
  return undefined;
}

function blockedEnv() {
  const env = process.env.CURASPHERE_ENV;
  return env === "production" || env === "staging";
}

function requirePermission(db: AppDatabase, actor: Actor, permission: string) {
  if (!actor.sessionId) throw new ForbiddenError("forbidden", "Sign in is required.");
  const permissions = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId).permissions;
  if (!permissions.includes(permission)) throw new ForbiddenError();
}

export function seedTelemetry(db: AppDatabase) {
  if (!get(db, `SELECT id FROM organizations WHERE id = 'org_demo_gh'`)) return;
  run(
    db,
    `INSERT INTO privacy_telemetry_policies (id, organization_id, version, status, allowed_fields, excluded_classes, destination, approval_state)
     VALUES (?, 'org_demo_gh', 1, 'active', ?, 'PII,PHI,AUTHENTICATION_SECRET', 'local-debug', 'pending_policy_approval')
     ON CONFLICT(id) DO NOTHING`,
    TELEMETRY_POLICY,
    [...ALLOWED].join(","),
  );
  const rules = [
    ["sig.cross-tenant.denied", "cross-tenant", 3, "high"],
    ["sig.session.revoked", "session", 1, "high"],
    ["sig.emergency.denied", "emergency", 3, "high"],
    ["sig.export.large", "export", 1, "high"],
    ["sig.export.wrong-subject", "export", 1, "high"],
    ["sig.consent.withdrawn", "consent", 1, "medium"],
    ["sig.retention.illegal", "retention", 1, "high"],
    ["sig.sanitizer.failure", "telemetry", 1, "high"],
  ] as const;
  for (const [id, category, threshold, severity] of rules) {
    run(
      db,
      `INSERT INTO privacy_signal_rules (id, organization_id, category, version, threshold, severity, dedupe_seconds, status, approval_state)
       VALUES (?, 'org_demo_gh', ?, 1, ?, ?, 3600, 'enabled', 'pending_policy_approval')
       ON CONFLICT(id) DO NOTHING`,
      id,
      category,
      threshold,
      severity,
    );
  }
  run(
    db,
    `INSERT INTO privacy_telemetry_health (id, organization_id, source, sanitizer, collector, destination, failure_category, updated_at)
     VALUES ('health_demo_gh', 'org_demo_gh', 'application', 'ready', 'unknown', 'local-debug', NULL, ?)
     ON CONFLICT(id) DO NOTHING`,
    new Date().toISOString(),
  );
}

export function emitSafeTelemetry(db: AppDatabase, actor: Actor, input: unknown) {
  requirePermission(db, actor, "privacy.telemetry.read");
  const sanitized = sanitizeTelemetry(input);
  const encoded = JSON.stringify(sanitized.event);
  if (SENSITIVE_VALUE.test(encoded) && sanitized.decision === "sanitized") {
    const safe = failed("residual-canary");
    storeEvent(db, actor, safe);
    raiseSignal(db, actor, "sig.sanitizer.failure", "telemetry-residual", 1);
    return safe;
  }
  storeEvent(db, actor, sanitized);
  if (sanitized.decision === "failed") raiseSignal(db, actor, "sig.sanitizer.failure", sanitized.categories[0] ?? "sanitizer", 1);
  return sanitized;
}

function storeEvent(db: AppDatabase, actor: Actor, sanitized: SanitizeResult) {
  run(
    db,
    `INSERT INTO privacy_telemetry_sink (id, organization_id, policy_version, decision, body, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    actor.organizationId,
    sanitized.policyVersion,
    sanitized.decision,
    JSON.stringify(sanitized.event),
    new Date().toISOString(),
  );
  appendAccessLedger(db, {
    organizationId: actor.organizationId,
    facilityId: actor.facilityId,
    actorId: actor.userId,
    subjectId: null,
    action: "privacy.telemetry.emit",
    resourceType: "PrivacyTelemetry",
    resourceId: TELEMETRY_POLICY,
    purpose: "AUDIT",
    outcome: sanitized.decision === "sanitized" ? "success" : "denied",
    correlationId: actor.sessionId,
    before: null,
    after: { resourceType: "PrivacyTelemetry", resourceId: TELEMETRY_POLICY, version: String(sanitized.policyVersion), fields: ["decision"] },
  });
}

export function raiseSignal(db: AppDatabase, actor: Actor, ruleId: string, sourceRef: string, count: number) {
  requirePermission(db, actor, "privacy.telemetry.read");
  const rule = get<{ id: string; version: number; threshold: number; severity: string; category: string; dedupe_seconds: number; status: string }>(
    db,
    `SELECT * FROM privacy_signal_rules WHERE id = ? AND organization_id = ?`,
    ruleId,
    actor.organizationId,
  );
  if (!rule || rule.status !== "enabled") throw new NotFoundError("That detection rule is not available.");
  if (count < rule.threshold) return { created: false as const, reason: "below-threshold" };
  const existing = get<{ id: string }>(db, `SELECT id FROM privacy_security_alerts WHERE organization_id = ? AND rule_id = ? AND source_ref = ?`, actor.organizationId, ruleId, sourceRef);
  if (existing) return { created: false as const, id: existing.id, reason: "deduped" };
  const now = new Date().toISOString();
  const id = `alt_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const dependency = get<{ value: string }>(db, `SELECT value FROM privacy_controls WHERE name = 'telemetry-dependency'`)?.value ?? "available";
  const status = dependency === "available" ? "delivered" : "delivery_failed";
  run(
    db,
    `INSERT INTO privacy_security_alerts (
      id, organization_id, facility_id, rule_id, rule_version, category, severity, status, source_ref, actor_id, version, detected_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`,
    id,
    actor.organizationId,
    actor.facilityId,
    rule.id,
    rule.version,
    rule.category,
    rule.severity,
    status,
    sourceRef,
    actor.userId,
    now,
    now,
  );
  run(
    db,
    `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'privacy.alert', ?, ?)`,
    randomUUID(),
    actor.organizationId,
    JSON.stringify({ alertId: id, ruleId, severity: rule.severity, status }),
    now,
  );
  recordAlertEvent(db, actor, id, "detected", status);
  return { created: true as const, id, status };
}

function recordAlertEvent(db: AppDatabase, actor: Actor, alertId: string, action: string, result: string) {
  run(
    db,
    `INSERT INTO privacy_alert_events (id, alert_id, actor_id, action, result, correlation_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    alertId,
    actor.userId,
    action,
    result,
    actor.sessionId,
    new Date().toISOString(),
  );
}

function loadAlert(db: AppDatabase, actor: Actor, id: string) {
  const row = get<{ id: string; organization_id: string; facility_id: string | null; status: string; version: number; rule_id: string; rule_version: number; severity: string; category: string; source_ref: string; actor_id: string }>(
    db,
    `SELECT * FROM privacy_security_alerts WHERE id = ?`,
    id,
  );
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That privacy alert is not available.");
  if (actor.facilityId && row.facility_id && row.facility_id !== actor.facilityId) throw new NotFoundError("That privacy alert is not available.");
  return row;
}

export function acknowledgeAlert(db: AppDatabase, actor: Actor, id: string, expectedVersion: number) {
  requirePermission(db, actor, "privacy.alert.acknowledge");
  return transition(db, actor, id, expectedVersion, ["delivered", "queued", "detected"], "acknowledged");
}

export function investigateAlert(db: AppDatabase, actor: Actor, id: string, expectedVersion: number, note: string) {
  requirePermission(db, actor, "privacy.alert.investigate");
  const safe = sanitizeTelemetry({ message: note, event: "investigation.note" });
  const row = transition(db, actor, id, expectedVersion, ["acknowledged", "investigating"], "investigating");
  run(db, `UPDATE privacy_security_alerts SET investigation_note = ? WHERE id = ?`, JSON.stringify(safe.event), id);
  return row;
}

export function escalateAlert(db: AppDatabase, actor: Actor, id: string, expectedVersion: number) {
  requirePermission(db, actor, "privacy.alert.investigate");
  return transition(db, actor, id, expectedVersion, ["investigating", "acknowledged"], "escalated");
}

export function resolveAlert(db: AppDatabase, actor: Actor, id: string, expectedVersion: number, disposition: string) {
  requirePermission(db, actor, "privacy.alert.investigate");
  if (!["confirmed", "false_positive", "no_action"].includes(disposition)) throw new ValidationError("invalid", "That disposition is not valid.");
  const next = disposition === "false_positive" ? "false_positive" : "resolved";
  const row = transition(db, actor, id, expectedVersion, ["investigating", "acknowledged", "escalated"], next);
  run(db, `UPDATE privacy_security_alerts SET disposition = ? WHERE id = ?`, disposition, id);
  return row;
}

export function retryAlertDelivery(db: AppDatabase, actor: Actor, id: string, expectedVersion: number) {
  requirePermission(db, actor, "privacy.alert.investigate");
  const dependency = get<{ value: string }>(db, `SELECT value FROM privacy_controls WHERE name = 'telemetry-dependency'`)?.value ?? "available";
  if (dependency !== "available") throw new ConflictError("conflict", "Alert delivery is unavailable.");
  return transition(db, actor, id, expectedVersion, ["delivery_failed"], "delivered");
}

function transition(db: AppDatabase, actor: Actor, id: string, expectedVersion: number, from: string[], status: string) {
  const row = loadAlert(db, actor, id);
  if (row.version !== expectedVersion) throw new ConflictError("conflict", "The privacy alert changed.");
  if (!from.includes(row.status)) throw new ConflictError("conflict", "That alert cannot move to the requested state.");
  const changed = run(db, `UPDATE privacy_security_alerts SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, status, new Date().toISOString(), id, expectedVersion);
  if (changed.changes !== 1) throw new ConflictError("conflict", "The privacy alert changed.");
  recordAlertEvent(db, actor, id, status, "success");
  return { id, status, version: expectedVersion + 1 };
}

export function syncPrivacySignals(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.telemetry.read");
  const large = all<{ export_id: string | null; record_count: number }>(db, `SELECT export_id, record_count FROM privacy_alerts WHERE organization_id = ? AND kind = 'large-export-requested'`, actor.organizationId);
  for (const row of large) raiseSignal(db, actor, "sig.export.large", row.export_id ?? "large-export", row.record_count);
  const denied = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM access_ledger WHERE organization_id = ? AND action = 'privacy.export.denied'`, actor.organizationId);
  if (Number(denied?.c ?? 0) > 0) raiseSignal(db, actor, "sig.export.wrong-subject", "privacy.export.denied", Number(denied?.c ?? 0));
  return listPrivacySecurityAlerts(db, actor);
}

export function listPrivacySecurityAlerts(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.alert.read");
  return all<{ id: string; rule_id: string; category: string; severity: string; status: string; source_ref: string; version: number }>(
    db,
    `SELECT id, rule_id, category, severity, status, source_ref, version FROM privacy_security_alerts WHERE organization_id = ? ORDER BY detected_at`,
    actor.organizationId,
  ).filter((row) => {
    if (!actor.facilityId) return true;
    const facility = get<{ facility_id: string | null }>(db, `SELECT facility_id FROM privacy_security_alerts WHERE id = ?`, row.id);
    return facility?.facility_id == null || facility.facility_id === actor.facilityId;
  });
}

export function readPrivacySecurityAlert(db: AppDatabase, actor: Actor, id: string) {
  requirePermission(db, actor, "privacy.alert.read");
  const row = loadAlert(db, actor, id);
  const events = all<{ action: string; actor_id: string; result: string; created_at: string }>(db, `SELECT action, actor_id, result, created_at FROM privacy_alert_events WHERE alert_id = ? ORDER BY created_at`, id);
  return { ...row, events };
}

export function telemetryOverview(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.telemetry.read");
  syncPrivacySignals(db, actor);
  const alerts = listPrivacySecurityAlerts(db, { ...actor });
  const health = get<{ sanitizer: string; collector: string; destination: string; failure_category: string | null }>(db, `SELECT sanitizer, collector, destination, failure_category FROM privacy_telemetry_health WHERE organization_id = ?`, actor.organizationId);
  const sink = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM privacy_telemetry_sink WHERE organization_id = ?`, actor.organizationId);
  const failures = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM privacy_telemetry_sink WHERE organization_id = ? AND decision = 'failed'`, actor.organizationId);
  return {
    alerts: alerts.length,
    open: alerts.filter((row) => !["resolved", "false_positive", "closed"].includes(row.status)).length,
    exports: alerts.filter((row) => row.category === "export").length,
    sink: Number(sink?.c ?? 0),
    sanitizerFailures: Number(failures?.c ?? 0),
    health: health ?? { sanitizer: "unknown", collector: "unknown", destination: "unknown", failure_category: null },
  };
}

export function readTelemetryPolicy(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.rule.read");
  const row = get<{ id: string; version: number; status: string; allowed_fields: string; excluded_classes: string; destination: string; approval_state: string }>(
    db,
    `SELECT id, version, status, allowed_fields, excluded_classes, destination, approval_state FROM privacy_telemetry_policies WHERE organization_id = ?`,
    actor.organizationId,
  );
  if (!row) throw new NotFoundError("That telemetry policy is not available.");
  return row;
}

export function listTelemetryRules(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.rule.read");
  return all<{ id: string; category: string; version: number; threshold: number; severity: string; status: string; approval_state: string }>(
    db,
    `SELECT id, category, version, threshold, severity, status, approval_state FROM privacy_signal_rules WHERE organization_id = ? ORDER BY id`,
    actor.organizationId,
  );
}

export function proposeRuleChange(db: AppDatabase, actor: Actor, ruleId: string, threshold: number) {
  requirePermission(db, actor, "privacy.rule.manage");
  if (!Number.isInteger(threshold) || threshold < 1 || threshold > 100) throw new ValidationError("invalid", "That threshold is not valid.");
  const rule = get<{ version: number }>(db, `SELECT version FROM privacy_signal_rules WHERE id = ? AND organization_id = ?`, ruleId, actor.organizationId);
  if (!rule) throw new NotFoundError("That detection rule is not available.");
  run(db, `UPDATE privacy_signal_rules SET threshold = ?, version = version + 1 WHERE id = ? AND organization_id = ?`, threshold, ruleId, actor.organizationId);
  appendAccessLedger(db, {
    organizationId: actor.organizationId,
    facilityId: actor.facilityId,
    actorId: actor.userId,
    subjectId: null,
    action: "privacy.rule.change",
    resourceType: "PrivacySignalRule",
    resourceId: ruleId,
    purpose: "AUDIT",
    outcome: "success",
    correlationId: actor.sessionId,
    before: null,
    after: { resourceType: "PrivacySignalRule", resourceId: ruleId, version: String(rule.version + 1), fields: ["threshold"] },
  });
  return { id: ruleId, version: rule.version + 1, threshold };
}

export function proposePolicyDisable(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.rule.manage");
  throw new ForbiddenError("forbidden", "Mandatory scrubbing cannot be disabled.");
}

export function runCanary(db: AppDatabase, actor: Actor, scenarioId: string) {
  requirePermission(db, actor, "privacy.telemetry.test");
  if (blockedEnv()) throw new ForbiddenError("forbidden", "The canary console is disabled in this environment.");
  const fixture = CANARIES[scenarioId];
  if (!fixture) throw new ValidationError("invalid", "That canary scenario is not available.");
  const result = emitSafeTelemetry(db, actor, fixture.input);
  const encoded = JSON.stringify(result.event);
  const leaked = fixture.markers.some((marker) => encoded.includes(marker));
  return { scenarioId, decision: result.decision, redacted: result.redacted, dropped: result.dropped, passed: !leaked && !fixture.markers.some((marker) => encoded.includes(marker)) };
}

export function setCollectorHealth(db: AppDatabase, actor: Actor, collector: "ready" | "disconnected", failure: string | null) {
  requirePermission(db, actor, "privacy.telemetry.read");
  run(
    db,
    `UPDATE privacy_telemetry_health SET collector = ?, failure_category = ?, updated_at = ? WHERE organization_id = ?`,
    collector,
    failure,
    new Date().toISOString(),
    actor.organizationId,
  );
}

export function setTelemetryDependency(db: AppDatabase, value: "available" | "unavailable") {
  run(db, `INSERT INTO privacy_controls (name, value) VALUES ('telemetry-dependency', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, value, value);
}

export function assertLedgerMetadataSafe(value: string) {
  if (SENSITIVE_VALUE.test(value)) throw new ValidationError("invalid", "That ledger value is not allowed.");
}

const CANARIES: Record<string, { input: unknown; markers: string[] }> = {
  "P03-F05-S01": { input: { event: "log", message: "status", note: "syn-canary-note" }, markers: ["syn-canary-note"] },
  "P03-F05-S02": { input: { event: "log", message: "555-010-0199" }, markers: ["555-010-0199"] },
  "P03-F05-S03": { input: { event: "log", email: "canary@example.invalid" }, markers: ["canary@example.invalid"] },
  "P03-F05-S04": { input: { event: "log", authorization: "Bearer syn-canary-token" }, markers: ["syn-canary-token", "Bearer"] },
  "P03-F05-S05": { input: { event: "log", cookie: "cura_session=syn-canary-cookie" }, markers: ["syn-canary-cookie", "cura_session="] },
  "P03-F05-S06": { input: { event: "log", route: "https://app.invalid/callback?code=syn-canary-authcode&state=syn-canary-state" }, markers: ["syn-canary-authcode", "code="] },
  "P03-F05-S07": { input: { event: "log", justification: "syn-canary-consent" }, markers: ["syn-canary-consent"] },
  "P03-F05-S08": { input: { event: "log", body: "syn-canary-emergency" }, markers: ["syn-canary-emergency"] },
  "P03-F05-S09": { input: { event: "log", payload: "synthetic-bulk-0" }, markers: ["synthetic-bulk-0"] },
  "P03-F05-S10": { input: { event: "log", nested: [{ token: "syn-canary-nested" }] }, markers: ["syn-canary-nested"] },
  "P03-F05-S11": { input: { event: "log", stack: "Error syn-canary-stack" }, markers: ["syn-canary-stack"] },
  "P03-F05-S12": { input: { event: "log", unknownField: "syn-canary-unknown" }, markers: ["syn-canary-unknown", "unknownField"] },
};

export const TELEMETRY_ROLLBACK = `
DROP TABLE IF EXISTS privacy_telemetry_sink;
DROP TABLE IF EXISTS privacy_alert_events;
DROP TABLE IF EXISTS privacy_security_alerts;
DROP TABLE IF EXISTS privacy_signal_rules;
DROP TABLE IF EXISTS privacy_telemetry_policies;
DROP TABLE IF EXISTS privacy_telemetry_health;
DELETE FROM schema_migrations WHERE version IN (37, 38, 39, 40, 41, 42, 43);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (36);
`;
