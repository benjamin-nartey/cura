import { createHash, randomUUID } from "node:crypto";
import { appendAccessLedger } from "./access-ledger";
import type { AppDatabase } from "./db";
import { all, get, run, transaction } from "./db";
import { effectivePermissions } from "./authorization";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";

export const RECORDS_MANAGER = "usr_gh_records";
export const LEGAL_HOLD_ADMIN = "usr_gh_legal";
const PROTECTED = new Set(["audit-ledger", "consent-history"]);
const DISPOSABLE = new Set(["temporary-admin", "notice-outbox"]);

export type RetentionActor = {
  userId: string;
  organizationId: string;
  facilityId: string | null;
  sessionId: string;
};

export type RetentionDecision = {
  resourceId: string;
  organizationId: string;
  facilityId: string | null;
  category: string;
  policyId: string | null;
  policyVersion: number | null;
  jurisdiction: string | null;
  retentionStart: string | null;
  expiryAt: string | null;
  holdId: string | null;
  decision: string;
  reason: string;
  approvalState: string | null;
  executionEligible: boolean;
};

type PolicyRow = {
  id: string;
  organization_id: string;
  facility_id: string | null;
  jurisdiction: string;
  category: string;
  classification: string;
  trigger_event: string;
  duration: number | null;
  duration_unit: string | null;
  expiry_action: string;
  approval_state: string;
  status: string;
  version: number;
  effective_at: string;
};

type RecordRow = {
  id: string;
  organization_id: string;
  facility_id: string | null;
  category: string;
  lifecycle_status: string;
  version: number;
  retention_start: string;
  payload_hash: string;
  created_at: string;
  updated_at: string;
};

type PlanItem = {
  id: string;
  dry_run_id: string;
  organization_id: string;
  resource_id: string;
  resource_version: number;
  decision: string;
  policy_id: string | null;
  policy_version: number | null;
  hold_id: string | null;
};

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function requirePermission(db: AppDatabase, actor: RetentionActor, permission: string) {
  if (!actor.sessionId) throw new ForbiddenError("forbidden", "Sign in is required.");
  const access = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId);
  if (!access.permissions.includes(permission)) throw new ForbiddenError();
}

function control(db: AppDatabase, name: string) {
  return get<{ value: string }>(db, `SELECT value FROM retention_controls WHERE name = ?`, name)?.value ?? null;
}

function clock(db: AppDatabase) {
  return control(db, "clock") ?? new Date().toISOString();
}

function bump(db: AppDatabase) {
  const next = String(Number(control(db, "revision") ?? "0") + 1);
  run(db, `INSERT INTO retention_controls (name, value) VALUES ('revision', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, next, next);
  return Number(next);
}

function count(db: AppDatabase, name: string) {
  run(
    db,
    `INSERT INTO retention_controls (name, value) VALUES (?, '1') ON CONFLICT(name) DO UPDATE SET value = CAST(value AS INTEGER) + 1`,
    name,
  );
}

function ledger(db: AppDatabase, actor: RetentionActor, action: string, resourceId: string, outcome: "success" | "denied") {
  appendAccessLedger(db, {
    organizationId: actor.organizationId,
    facilityId: actor.facilityId,
    actorId: actor.userId,
    subjectId: null,
    action,
    resourceType: "RetentionRecord",
    resourceId,
    purpose: "AUDIT",
    outcome,
    correlationId: actor.sessionId,
    before: null,
    after: { resourceType: "RetentionRecord", resourceId, version: "1", fields: ["status"] },
  });
}

function destructiveBlocked() {
  const env = process.env.CURASPHERE_ENV;
  return env === "production" || env === "staging";
}

function addDuration(start: string, duration: number, unit: string) {
  const date = new Date(start);
  if (Number.isNaN(date.getTime())) throw new ValidationError("invalid", "The retention start is not valid.");
  if (unit === "minute") date.setUTCMinutes(date.getUTCMinutes() + duration);
  else if (unit === "hour") date.setUTCHours(date.getUTCHours() + duration);
  else if (unit === "day") date.setUTCDate(date.getUTCDate() + duration);
  else throw new ValidationError("invalid", "The retention unit is not valid.");
  return date.toISOString();
}

function activeHold(db: AppDatabase, organizationId: string, facilityId: string | null, category: string, resourceId: string) {
  const holds = all<{ id: string; facility_id: string | null; scope_kind: string; scope_ref: string }>(
    db,
    `SELECT id, facility_id, scope_kind, scope_ref FROM legal_holds WHERE organization_id = ? AND status = 'active'`,
    organizationId,
  );
  for (const hold of holds) {
    if (hold.facility_id && facilityId && hold.facility_id !== facilityId) continue;
    if (hold.scope_kind === "resource" && hold.scope_ref === resourceId) return hold.id;
    if (hold.scope_kind === "category" && hold.scope_ref === category) return hold.id;
    const member = get<{ resource_id: string }>(
      db,
      `SELECT resource_id FROM legal_hold_resources WHERE hold_id = ? AND resource_id = ? AND organization_id = ?`,
      hold.id,
      resourceId,
      organizationId,
    );
    if (member) return hold.id;
  }
  return null;
}

export function seedRetention(db: AppDatabase) {
  if (!get(db, `SELECT id FROM organizations WHERE id = 'org_demo_gh'`)) return;
  const now = "2026-10-14T00:00:00.000Z";
  const policies = [
    ["pol_syn_gh_temp", "org_demo_gh", "SYNTHETIC_GH", "temporary-admin", "dispose", 1],
    ["pol_syn_eu_temp", "org_demo_eu", "SYNTHETIC_EU", "temporary-admin", "dispose", 2],
    ["pol_syn_default_job", "org_demo_gh", "SYNTHETIC_DEFAULT", "operational-job", "retain", null],
    ["pol_syn_gh_outbox", "org_demo_gh", "SYNTHETIC_GH", "notice-outbox", "archive", 1],
    ["pol_syn_gh_audit", "org_demo_gh", "SYNTHETIC_GH", "audit-ledger", "retain", null],
    ["pol_syn_gh_consent", "org_demo_gh", "SYNTHETIC_GH", "consent-history", "retain", null],
  ] as const;
  for (const [id, organizationId, jurisdiction, category, action, duration] of policies) {
    run(
      db,
      `INSERT INTO retention_policies (
        id, organization_id, facility_id, jurisdiction, category, classification, trigger_event, duration, duration_unit,
        expiry_action, approval_state, status, version, effective_at, created_at, updated_at
      ) VALUES (?, ?, NULL, ?, ?, 'synthetic', 'record-created', ?, ?, ?, 'pending_policy_approval', 'active', 1, ?, ?, ?)
      ON CONFLICT(id) DO NOTHING`,
      id,
      organizationId,
      jurisdiction,
      category,
      duration,
      duration === null ? null : "day",
      action,
      now,
      now,
      now,
    );
  }
  run(db, `INSERT INTO retention_controls (name, value) VALUES ('dependency', 'available') ON CONFLICT(name) DO NOTHING`);
  run(db, `INSERT INTO retention_controls (name, value) VALUES ('archive', 'available') ON CONFLICT(name) DO NOTHING`);
  run(db, `INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_gh_records', 'org_demo_gh', 'fac_gh_accra', 'Adjoa Frimpong', 'auditor') ON CONFLICT(id) DO NOTHING`);
  run(db, `INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_gh_legal', 'org_demo_gh', 'fac_gh_accra', 'Yaw Owusu', 'auditor') ON CONFLICT(id) DO NOTHING`);
  run(db, `INSERT INTO organization_memberships (id, organization_id, user_id, status, version) VALUES ('om_org_demo_gh_usr_gh_records', 'org_demo_gh', 'usr_gh_records', 'active', 1) ON CONFLICT(organization_id, user_id) DO NOTHING`);
  run(db, `INSERT INTO organization_memberships (id, organization_id, user_id, status, version) VALUES ('om_org_demo_gh_usr_gh_legal', 'org_demo_gh', 'usr_gh_legal', 'active', 1) ON CONFLICT(organization_id, user_id) DO NOTHING`);
  run(db, `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version) VALUES ('fm_fac_gh_accra_usr_gh_records', 'org_demo_gh', 'fac_gh_accra', 'usr_gh_records', 'records-manager', 'active', 1) ON CONFLICT(facility_id, user_id) DO NOTHING`);
  run(db, `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version) VALUES ('fm_fac_gh_accra_usr_gh_legal', 'org_demo_gh', 'fac_gh_accra', 'usr_gh_legal', 'legal-hold-admin', 'active', 1) ON CONFLICT(facility_id, user_id) DO NOTHING`);
}

export function setRetentionClock(db: AppDatabase, value: string | null) {
  if (value === null) run(db, `DELETE FROM retention_controls WHERE name = 'clock'`);
  else run(db, `INSERT INTO retention_controls (name, value) VALUES ('clock', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, value, value);
}

export function setRetentionDependency(db: AppDatabase, value: "available" | "unavailable") {
  run(db, `INSERT INTO retention_controls (name, value) VALUES ('dependency', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, value, value);
}

export function setArchiveDependency(db: AppDatabase, value: "available" | "unavailable") {
  run(db, `INSERT INTO retention_controls (name, value) VALUES ('archive', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, value, value);
}

export function createRetentionRecord(db: AppDatabase, actor: RetentionActor, input: { category: string; retentionStart: string; idempotencyKey: string }) {
  requirePermission(db, actor, "retention.evaluate");
  if (!DISPOSABLE.has(input.category)) throw new ValidationError("invalid", "That category is not a disposable synthetic record.");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) throw new ValidationError("invalid", "The idempotency key is not valid.");
  if (Number.isNaN(Date.parse(input.retentionStart))) throw new ValidationError("invalid", "The retention start is not valid.");
  const existing = get<{ id: string }>(db, `SELECT resource_id AS id FROM retention_job_items WHERE id = ?`, input.idempotencyKey);
  const prior = get<RecordRow>(db, `SELECT * FROM retention_records WHERE id = ?`, `ret_${input.idempotencyKey}`);
  if (prior) return prior;
  void existing;
  const now = clock(db);
  const row: RecordRow = {
    id: `ret_${input.idempotencyKey}`,
    organization_id: actor.organizationId,
    facility_id: actor.facilityId,
    category: input.category,
    lifecycle_status: "active",
    version: 1,
    retention_start: input.retentionStart,
    payload_hash: sha(`${input.category}|${input.idempotencyKey}`),
    created_at: now,
    updated_at: now,
  };
  run(
    db,
    `INSERT INTO retention_records (id, organization_id, facility_id, category, lifecycle_status, version, retention_start, payload_hash, created_at, updated_at) VALUES (?, ?, ?, ?, 'active', 1, ?, ?, ?, ?)`,
    row.id,
    row.organization_id,
    row.facility_id,
    row.category,
    row.retention_start,
    row.payload_hash,
    row.created_at,
    row.updated_at,
  );
  ledger(db, actor, "retention.record", row.id, "success");
  return row;
}

export function updateRetentionPolicy(db: AppDatabase, actor: RetentionActor, id: string, input: { duration: number; durationUnit: string; expectedVersion: number }) {
  requirePermission(db, actor, "retention.policy.manage");
  if (!Number.isInteger(input.duration) || input.duration < 1) throw new ValidationError("invalid", "The retention period is not valid.");
  if (!["minute", "hour", "day"].includes(input.durationUnit)) throw new ValidationError("invalid", "The retention unit is not valid.");
  return transaction(db, () => {
    const policy = get<PolicyRow>(db, `SELECT * FROM retention_policies WHERE id = ?`, id);
    if (!policy || policy.organization_id !== actor.organizationId) throw new NotFoundError("That retention policy is not available.");
    if (policy.version !== input.expectedVersion) throw new ConflictError("conflict", "The retention policy changed.");
    const now = clock(db);
    run(
      db,
      `INSERT INTO retention_policy_versions (id, policy_id, version, snapshot_hash, actor_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?)`,
      randomUUID(),
      policy.id,
      policy.version,
      sha(JSON.stringify({ duration: policy.duration, action: policy.expiry_action, version: policy.version })),
      actor.userId,
      now,
    );
    const changed = run(
      db,
      `UPDATE retention_policies SET duration = ?, duration_unit = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
      input.duration,
      input.durationUnit,
      now,
      id,
      input.expectedVersion,
    );
    if (changed.changes !== 1) throw new ConflictError("conflict", "The retention policy changed.");
    ledger(db, actor, "retention.policy", id, "success");
    count(db, "policy_updates");
    bump(db);
    return { ...policy, duration: input.duration, duration_unit: input.durationUnit, version: policy.version + 1 };
  });
}

export function evaluateRetention(db: AppDatabase, actor: RetentionActor, input: { resourceType: string; resourceId: string }): RetentionDecision {
  requirePermission(db, actor, "retention.evaluate");
  return decideRetention(db, actor, input);
}

function decideRetention(db: AppDatabase, actor: RetentionActor, input: { resourceType: string; resourceId: string }): RetentionDecision {
  count(db, "evaluations");
  const base = {
    resourceId: input.resourceId,
    organizationId: actor.organizationId,
    facilityId: actor.facilityId,
    category: input.resourceType,
    policyId: null,
    policyVersion: null,
    jurisdiction: null,
    retentionStart: null,
    expiryAt: null,
    holdId: null,
    approvalState: null,
    executionEligible: false,
  };
  if (control(db, "dependency") === "unavailable") {
    count(db, "evaluation_failures");
    return { ...base, decision: "error", reason: "retention-unavailable" };
  }
  if (PROTECTED.has(input.resourceType)) {
    return { ...base, decision: "retain", reason: "protected-category" };
  }
  const record = get<RecordRow>(db, `SELECT * FROM retention_records WHERE id = ?`, input.resourceId);
  if (!record || record.organization_id !== actor.organizationId) throw new NotFoundError("That retention record is not available.");
  if (actor.facilityId && record.facility_id && record.facility_id !== actor.facilityId) throw new NotFoundError("That retention record is not available.");
  const scoped = { ...base, facilityId: record.facility_id, category: record.category, retentionStart: record.retention_start };
  if (record.lifecycle_status === "disposed") return { ...scoped, decision: "retain", reason: "already-disposed" };
  if (record.lifecycle_status === "archived") return { ...scoped, decision: "retain", reason: "already-archived" };
  const policies = all<PolicyRow>(
    db,
    `SELECT * FROM retention_policies WHERE organization_id = ? AND category = ? AND status = 'active'`,
    actor.organizationId,
    record.category,
  );
  if (policies.length === 0) return { ...scoped, decision: "policy_missing", reason: "policy-missing" };
  if (policies.length > 1) return { ...scoped, decision: "policy_conflict", reason: "policy-conflict" };
  const policy = policies[0];
  if (!policy) return { ...scoped, decision: "policy_missing", reason: "policy-missing" };
  const withPolicy = {
    ...scoped,
    policyId: policy.id,
    policyVersion: policy.version,
    jurisdiction: policy.jurisdiction,
    approvalState: policy.approval_state,
  };
  const holdId = activeHold(db, actor.organizationId, record.facility_id, record.category, record.id);
  if (policy.expiry_action === "retain" || policy.duration === null || !policy.duration_unit) {
    return { ...withPolicy, holdId, decision: "retain", reason: holdId ? "legal-hold" : "policy-retain" };
  }
  const expiryAt = addDuration(record.retention_start, policy.duration, policy.duration_unit);
  const at = clock(db);
  if (Date.parse(record.retention_start) > Date.parse(at) || Date.parse(expiryAt) > Date.parse(at)) {
    return { ...withPolicy, expiryAt, holdId, decision: "retain", reason: "not-expired" };
  }
  if (holdId) return { ...withPolicy, expiryAt, holdId, decision: "hold_blocked", reason: "legal-hold" };
  if (policy.expiry_action === "archive") return { ...withPolicy, expiryAt, decision: "archive_eligible", reason: "archive-due", executionEligible: !destructiveBlocked() };
  if (policy.expiry_action === "dispose") return { ...withPolicy, expiryAt, decision: "purge_eligible", reason: "purge-due", executionEligible: !destructiveBlocked() };
  return { ...withPolicy, expiryAt, decision: "review_required", reason: "review-required" };
}

function planHash(items: Array<{ resource_id: string; resource_version: number; decision: string }>) {
  return sha(items.map((item) => `${item.resource_id}:${item.resource_version}:${item.decision}`).sort().join("|"));
}

export function createDryRun(db: AppDatabase, actor: RetentionActor, idempotencyKey: string) {
  requirePermission(db, actor, "retention.dry-run");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) throw new ValidationError("invalid", "The idempotency key is not valid.");
  const existing = get<{ id: string }>(db, `SELECT id FROM retention_jobs WHERE organization_id = ? AND idempotency_key = ?`, actor.organizationId, idempotencyKey);
  if (existing) {
    const job = get<{ dry_run_id: string }>(db, `SELECT dry_run_id FROM retention_jobs WHERE id = ?`, existing.id);
    return { jobId: existing.id, dryRunId: job?.dry_run_id ?? "", idempotent: true as const };
  }
  if (control(db, "dependency") === "unavailable") throw new ConflictError("conflict", "Retention data is unavailable.");
  const records = all<RecordRow>(
    db,
    `SELECT * FROM retention_records WHERE organization_id = ? AND lifecycle_status = 'active' AND (? IS NULL OR facility_id IS NULL OR facility_id = ?)`,
    actor.organizationId,
    actor.facilityId,
    actor.facilityId,
  );
  const now = clock(db);
  const expires = new Date(Date.parse(now) + 2 * 60 * 60 * 1000).toISOString();
  const dryRunId = `dry_${randomUUID()}`;
  const items: PlanItem[] = [];
  let eligible = 0;
  let held = 0;
  let review = 0;
  let missing = 0;
  for (const record of records) {
    const decision = decideRetention(db, actor, { resourceType: record.category, resourceId: record.id });
    if (decision.decision === "purge_eligible" || decision.decision === "archive_eligible") eligible += 1;
    if (decision.decision === "hold_blocked") held += 1;
    if (decision.decision === "review_required" || decision.decision === "policy_conflict") review += 1;
    if (decision.decision === "policy_missing" || decision.decision === "error") missing += 1;
    items.push({
      id: randomUUID(),
      dry_run_id: dryRunId,
      organization_id: actor.organizationId,
      resource_id: record.id,
      resource_version: record.version,
      decision: decision.decision,
      policy_id: decision.policyId,
      policy_version: decision.policyVersion,
      hold_id: decision.holdId,
    });
  }
  const hash = planHash(items);
  const jobId = `job_${randomUUID()}`;
  transaction(db, () => {
    run(
      db,
      `INSERT INTO retention_dry_runs (id, organization_id, requester_id, evaluated_at, expires_at, plan_hash, eligible_count, held_count, review_count, missing_count, status, version) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open', ?)`,
      dryRunId,
      actor.organizationId,
      actor.userId,
      now,
      expires,
      hash,
      eligible,
      held,
      review,
      missing,
      Number(control(db, "revision") ?? "0"),
    );
    for (const item of items) {
      run(
        db,
        `INSERT INTO retention_plan_items (id, dry_run_id, organization_id, resource_id, resource_version, decision, policy_id, policy_version, hold_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        item.id,
        item.dry_run_id,
        item.organization_id,
        item.resource_id,
        item.resource_version,
        item.decision,
        item.policy_id,
        item.policy_version,
        item.hold_id,
      );
    }
    run(
      db,
      `INSERT INTO retention_jobs (id, organization_id, job_type, dry_run_id, requester_id, status, cursor_resource, success_count, skip_count, failure_count, idempotency_key, correlation_id, retry_count, scheduled_at, started_at, finished_at) VALUES (?, ?, 'dry-run', ?, ?, 'completed', NULL, ?, ?, 0, ?, ?, 0, ?, ?, ?)`,
      jobId,
      actor.organizationId,
      dryRunId,
      actor.userId,
      eligible,
      held + review + missing,
      idempotencyKey,
      actor.sessionId,
      now,
      now,
      now,
    );
    ledger(db, actor, "retention.dry-run", dryRunId, "success");
    count(db, "dry_runs");
  });
  return { jobId, dryRunId, eligible, held, review, missing, planHash: hash, idempotent: false };
}

export function executeDryRun(
  db: AppDatabase,
  actor: RetentionActor,
  dryRunId: string,
  idempotencyKey: string,
  mode: "dispose" | "archive",
  options: { beforeItem?: (resourceId: string) => void } = {},
) {
  requirePermission(db, actor, "retention.execute");
  if (destructiveBlocked()) throw new ForbiddenError("forbidden", "Destructive retention is disabled in this environment.");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) throw new ValidationError("invalid", "The idempotency key is not valid.");
  if (control(db, "dependency") === "unavailable") throw new ConflictError("conflict", "Retention data is unavailable.");
  const existing = get<{ id: string; status: string }>(db, `SELECT id, status FROM retention_jobs WHERE organization_id = ? AND idempotency_key = ?`, actor.organizationId, idempotencyKey);
  if (existing?.status === "completed" || existing?.status === "cancelled") return { jobId: existing.id, status: existing.status, success: 0, skip: 0, failure: 0, blocked: 0, idempotent: true as const };
  const dry = get<{ id: string; organization_id: string; expires_at: string; plan_hash: string; status: string; version: number }>(db, `SELECT id, organization_id, expires_at, plan_hash, status, version FROM retention_dry_runs WHERE id = ?`, dryRunId);
  if (!dry || dry.organization_id !== actor.organizationId) throw new NotFoundError("That retention plan is not available.");
  const items = all<PlanItem>(db, `SELECT * FROM retention_plan_items WHERE dry_run_id = ? ORDER BY resource_id`, dryRunId);
  if (planHash(items) !== dry.plan_hash) throw new ConflictError("conflict", "The retention plan no longer matches its preview.");
  if (Date.parse(clock(db)) > Date.parse(dry.expires_at)) throw new ConflictError("conflict", "The retention preview has expired.");
  if (Number(control(db, "revision") ?? "0") !== dry.version) {
    ledger(db, actor, "retention.blocked", items[0]?.resource_id ?? dry.id, "denied");
    count(db, "blocked");
    throw new ConflictError("conflict", "A hold or policy changed after the preview.");
  }
  const now = clock(db);
  const jobId = existing?.id ?? `job_${randomUUID()}`;
  if (!existing) {
    run(
      db,
      `INSERT INTO retention_jobs (id, organization_id, job_type, dry_run_id, requester_id, status, cursor_resource, success_count, skip_count, failure_count, idempotency_key, correlation_id, retry_count, scheduled_at, started_at, finished_at) VALUES (?, ?, ?, ?, ?, 'running', NULL, 0, 0, 0, ?, ?, 0, ?, ?, NULL)`,
      jobId,
      actor.organizationId,
      mode,
      dryRunId,
      actor.userId,
      idempotencyKey,
      actor.sessionId,
      now,
      now,
    );
  } else {
    run(db, `UPDATE retention_jobs SET retry_count = retry_count + 1 WHERE id = ?`, jobId);
  }
  let success = 0;
  let skip = 0;
  let failure = 0;
  let blocked = 0;
  try {
    for (const item of items) {
      const done = get<{ id: string }>(db, `SELECT id FROM retention_job_items WHERE job_id = ? AND resource_id = ?`, jobId, item.resource_id);
      if (done) continue;
      options.beforeItem?.(item.resource_id);
      const outcome = transaction(db, () => applyItem(db, actor, jobId, item, mode, dryRunId));
      if (outcome === "success") success += 1;
      else if (outcome === "failed") failure += 1;
      else if (outcome === "blocked") blocked += 1;
      else skip += 1;
      run(db, `UPDATE retention_jobs SET cursor_resource = ?, success_count = success_count + ?, skip_count = skip_count + ?, failure_count = failure_count + ? WHERE id = ?`, item.resource_id, outcome === "success" ? 1 : 0, outcome === "skipped" ? 1 : 0, outcome === "failed" ? 1 : 0, jobId);
    }
    run(db, `UPDATE retention_jobs SET status = 'completed', finished_at = ? WHERE id = ?`, clock(db), jobId);
    run(db, `UPDATE retention_dry_runs SET status = 'executed' WHERE id = ? AND status = 'open'`, dryRunId);
    return { jobId, status: "completed" as const, success, skip, failure, blocked, idempotent: false };
  } catch (error) {
    count(db, "job_failures");
    throw error;
  }
}

function applyItem(db: AppDatabase, actor: RetentionActor, jobId: string, item: PlanItem, mode: "dispose" | "archive", dryRunId: string) {
  const wanted = mode === "dispose" ? "purge_eligible" : "archive_eligible";
  const record = get<RecordRow>(db, `SELECT * FROM retention_records WHERE id = ?`, item.resource_id);
  if (!record || record.organization_id !== actor.organizationId) {
    writeJobItem(db, jobId, item, "skipped", "missing");
    return "skipped" as const;
  }
  if (record.lifecycle_status !== "active") {
    writeJobItem(db, jobId, item, "skipped", "already-finished");
    return "skipped" as const;
  }
  const decision = decideRetention(db, actor, { resourceType: record.category, resourceId: record.id });
  if (item.decision !== wanted || decision.decision !== wanted || decision.policyVersion !== item.policy_version || record.version !== item.resource_version || !decision.executionEligible) {
    const reason = decision.decision === "hold_blocked" ? "legal-hold" : "plan-stale";
    writeJobItem(db, jobId, item, "blocked", reason);
    ledger(db, actor, "retention.blocked", record.id, "denied");
    count(db, "blocked");
    return "blocked" as const;
  }
  const tombstone = get<{ resource_id: string }>(db, `SELECT resource_id FROM retention_tombstones WHERE resource_id = ?`, record.id);
  if (tombstone || record.lifecycle_status !== "active") {
    writeJobItem(db, jobId, item, "skipped", "already-finished");
    return "skipped" as const;
  }
  const now = clock(db);
  if (mode === "archive") {
    if (control(db, "archive") === "unavailable") {
      writeJobItem(db, jobId, item, "failed", "archive-unavailable");
      count(db, "archive_failures");
      return "failed" as const;
    }
    const changed = run(db, `UPDATE retention_records SET lifecycle_status = 'archived', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND lifecycle_status = 'active'`, now, record.id, record.version);
    if (changed.changes !== 1) {
      writeJobItem(db, jobId, item, "skipped", "already-finished");
      return "skipped" as const;
    }
    run(db, `INSERT INTO retention_archives (id, organization_id, resource_id, checksum, verified, archived_at) VALUES (?, ?, ?, ?, 1, ?)`, randomUUID(), actor.organizationId, record.id, record.payload_hash, now);
    writeJobItem(db, jobId, item, "archived", null);
    ledger(db, actor, "retention.archive", record.id, "success");
    count(db, "archives");
    return "success" as const;
  }
  const changed = run(db, `UPDATE retention_records SET lifecycle_status = 'disposed', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND lifecycle_status = 'active'`, now, record.id, record.version);
  if (changed.changes !== 1) {
    writeJobItem(db, jobId, item, "skipped", "already-finished");
    return "skipped" as const;
  }
  run(db, `INSERT INTO retention_tombstones (resource_id, organization_id, category, disposed_at, plan_id) VALUES (?, ?, ?, ?, ?)`, record.id, actor.organizationId, record.category, now, dryRunId);
  writeJobItem(db, jobId, item, "disposed", null);
  ledger(db, actor, "retention.dispose", record.id, "success");
  count(db, "disposals");
  return "success" as const;
}

function writeJobItem(db: AppDatabase, jobId: string, item: PlanItem, outcome: string, reason: string | null) {
  run(
    db,
    `INSERT INTO retention_job_items (id, job_id, resource_id, decision, outcome, failure_reason, executed_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    jobId,
    item.resource_id,
    item.decision,
    outcome,
    reason,
    clock(db),
  );
}

export function createLegalHold(db: AppDatabase, actor: RetentionActor, input: { matterRef: string; scopeKind: "resource" | "category"; scopeRef: string; reasonCode: string; authorityRef: string; idempotencyKey: string }) {
  requirePermission(db, actor, "legal-hold.create");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) throw new ValidationError("invalid", "The idempotency key is not valid.");
  if (!/^[A-Z0-9-]{8,80}$/.test(input.matterRef)) throw new ValidationError("invalid", "The matter reference is not valid.");
  if (!["investigation", "policy-review"].includes(input.reasonCode)) throw new ValidationError("invalid", "The hold reason is not valid.");
  if (!["synthetic-development-authority"].includes(input.authorityRef)) throw new ValidationError("invalid", "The hold authority is not a configured synthetic authority.");
  const existing = get<{ id: string }>(db, `SELECT id FROM legal_holds WHERE id = ?`, `hold_${input.idempotencyKey}`);
  if (existing) return { id: existing.id, status: "draft" as const, idempotent: true };
  if (input.scopeKind === "resource") {
    const record = get<{ organization_id: string }>(db, `SELECT organization_id FROM retention_records WHERE id = ?`, input.scopeRef);
    if (!record || record.organization_id !== actor.organizationId) throw new NotFoundError("That retention record is not available.");
  }
  const now = clock(db);
  const id = `hold_${input.idempotencyKey}`;
  run(
    db,
    `INSERT INTO legal_holds (id, organization_id, facility_id, matter_ref, scope_kind, scope_ref, reason_code, authority_ref, issuing_actor, status, effective_at, review_at, released_at, released_by, release_reason, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'draft', NULL, NULL, NULL, NULL, NULL, 1, ?, ?)`,
    id,
    actor.organizationId,
    actor.facilityId,
    input.matterRef,
    input.scopeKind,
    input.scopeRef,
    input.reasonCode,
    input.authorityRef,
    actor.userId,
    now,
    now,
  );
  ledger(db, actor, "legal-hold.create", id, "success");
  bump(db);
  return { id, status: "draft" as const, idempotent: false };
}

export function activateLegalHold(db: AppDatabase, actor: RetentionActor, id: string, expectedVersion: number) {
  requirePermission(db, actor, "legal-hold.activate");
  return transaction(db, () => {
    const hold = loadHold(db, actor, id);
    if (hold.version !== expectedVersion) throw new ConflictError("conflict", "The legal hold changed.");
    if (hold.status !== "draft") throw new ConflictError("conflict", "That legal hold cannot be activated.");
    const now = clock(db);
    const changed = run(db, `UPDATE legal_holds SET status = 'active', effective_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = 'draft'`, now, now, id, expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The legal hold changed.");
    if (hold.scope_kind === "resource") {
      run(db, `INSERT INTO legal_hold_resources (hold_id, resource_id, organization_id) VALUES (?, ?, ?) ON CONFLICT(hold_id, resource_id) DO NOTHING`, id, hold.scope_ref, actor.organizationId);
    }
    ledger(db, actor, "legal-hold.activate", id, "success");
    count(db, "holds_active");
    bump(db);
    return { id, status: "active" as const, version: hold.version + 1 };
  });
}

export function releaseLegalHold(db: AppDatabase, actor: RetentionActor, id: string, expectedVersion: number, reasonCode: string) {
  requirePermission(db, actor, "legal-hold.release");
  if (!["investigation-closed", "scope-corrected"].includes(reasonCode)) throw new ValidationError("invalid", "The release reason is not valid.");
  return transaction(db, () => {
    const hold = loadHold(db, actor, id);
    if (hold.issuing_actor === actor.userId) throw new ForbiddenError("forbidden", "The issuer cannot release this hold.");
    if (hold.version !== expectedVersion) throw new ConflictError("conflict", "The legal hold changed.");
    if (hold.status !== "active") throw new ConflictError("conflict", "That legal hold is not active.");
    const now = clock(db);
    const changed = run(db, `UPDATE legal_holds SET status = 'released', released_at = ?, released_by = ?, release_reason = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = 'active'`, now, actor.userId, reasonCode, now, id, expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The legal hold changed.");
    ledger(db, actor, "legal-hold.release", id, "success");
    bump(db);
    return { id, status: "released" as const, version: hold.version + 1 };
  });
}

function loadHold(db: AppDatabase, actor: RetentionActor, id: string) {
  const hold = get<{ id: string; organization_id: string; facility_id: string | null; status: string; version: number; issuing_actor: string; scope_kind: string; scope_ref: string; matter_ref: string; reason_code: string; authority_ref: string; released_at: string | null; released_by: string | null; release_reason: string | null }>(db, `SELECT * FROM legal_holds WHERE id = ?`, id);
  if (!hold || hold.organization_id !== actor.organizationId) throw new NotFoundError("That legal hold is not available.");
  if (actor.facilityId && hold.facility_id && hold.facility_id !== actor.facilityId) throw new NotFoundError("That legal hold is not available.");
  return hold;
}

export function readLegalHold(db: AppDatabase, actor: RetentionActor, id: string) {
  requirePermission(db, actor, "legal-hold.read");
  return loadHold(db, actor, id);
}

export function listLegalHolds(db: AppDatabase, actor: RetentionActor) {
  requirePermission(db, actor, "legal-hold.read");
  return all<{ id: string; matter_ref: string; scope_kind: string; scope_ref: string; status: string; issuing_actor: string; version: number; created_at: string }>(db, `SELECT id, matter_ref, scope_kind, scope_ref, status, issuing_actor, version, created_at FROM legal_holds WHERE organization_id = ? ORDER BY created_at DESC`, actor.organizationId);
}

export function listRetentionPolicies(db: AppDatabase, actor: RetentionActor) {
  requirePermission(db, actor, "retention.policy.read");
  return all<PolicyRow>(db, `SELECT * FROM retention_policies WHERE organization_id = ? ORDER BY category`, actor.organizationId);
}

export function readRetentionRecord(db: AppDatabase, actor: RetentionActor, id: string) {
  requirePermission(db, actor, "retention.evaluate");
  const record = get<RecordRow>(db, `SELECT * FROM retention_records WHERE id = ? AND lifecycle_status != 'disposed'`, id);
  if (!record || record.organization_id !== actor.organizationId) throw new NotFoundError("That retention record is not available.");
  return record;
}

export function listRetentionJobs(db: AppDatabase, actor: RetentionActor) {
  requirePermission(db, actor, "retention.job.read");
  return all<{ id: string; job_type: string; status: string; success_count: number; skip_count: number; failure_count: number; dry_run_id: string | null }>(db, `SELECT id, job_type, status, success_count, skip_count, failure_count, dry_run_id FROM retention_jobs WHERE organization_id = ? ORDER BY scheduled_at DESC LIMIT 50`, actor.organizationId);
}

export function readRetentionJob(db: AppDatabase, actor: RetentionActor, id: string) {
  requirePermission(db, actor, "retention.job.read");
  const job = get<{ id: string; organization_id: string; job_type: string; status: string; success_count: number; skip_count: number; failure_count: number; retry_count: number }>(db, `SELECT * FROM retention_jobs WHERE id = ?`, id);
  if (!job || job.organization_id !== actor.organizationId) throw new NotFoundError("That retention job is not available.");
  const items = all<{ resource_id: string; decision: string; outcome: string; failure_reason: string | null }>(db, `SELECT resource_id, decision, outcome, failure_reason FROM retention_job_items WHERE job_id = ?`, id);
  return { job, items };
}

export function readDryRun(db: AppDatabase, actor: RetentionActor, id: string) {
  requirePermission(db, actor, "retention.dry-run");
  const dry = get(db, `SELECT * FROM retention_dry_runs WHERE id = ?`, id) as { id: string; organization_id: string } | undefined;
  if (!dry || dry.organization_id !== actor.organizationId) throw new NotFoundError("That retention plan is not available.");
  const items = all<{ resource_id: string; decision: string; policy_id: string | null; policy_version: number | null; hold_id: string | null }>(db, `SELECT resource_id, decision, policy_id, policy_version, hold_id FROM retention_plan_items WHERE dry_run_id = ?`, id);
  return { dry, items };
}

export function cancelRetentionJob(db: AppDatabase, actor: RetentionActor, id: string) {
  requirePermission(db, actor, "retention.execute");
  const job = get<{ id: string; organization_id: string; status: string }>(db, `SELECT id, organization_id, status FROM retention_jobs WHERE id = ?`, id);
  if (!job || job.organization_id !== actor.organizationId) throw new NotFoundError("That retention job is not available.");
  if (job.status !== "running") throw new ConflictError("conflict", "That retention job is not running.");
  run(db, `UPDATE retention_jobs SET status = 'cancelled', finished_at = ? WHERE id = ? AND status = 'running'`, clock(db), id);
  return { id, status: "cancelled" as const };
}

export function retentionOverview(db: AppDatabase, actor: RetentionActor) {
  requirePermission(db, actor, "retention.policy.read");
  const records = all<RecordRow>(db, `SELECT * FROM retention_records WHERE organization_id = ?`, actor.organizationId);
  let active = 0;
  let archived = 0;
  let disposed = 0;
  let eligible = 0;
  let held = 0;
  for (const record of records) {
    if (record.lifecycle_status === "active") active += 1;
    if (record.lifecycle_status === "archived") archived += 1;
    if (record.lifecycle_status === "disposed") disposed += 1;
    if (record.lifecycle_status !== "active") continue;
    try {
      const decision = decideRetention(db, actor, { resourceType: record.category, resourceId: record.id });
      if (decision.decision === "purge_eligible" || decision.decision === "archive_eligible") eligible += 1;
      if (decision.decision === "hold_blocked") held += 1;
    } catch {
      held += 0;
    }
  }
  const holds = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM legal_holds WHERE organization_id = ? AND status = 'active'`, actor.organizationId);
  const failed = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM retention_jobs WHERE organization_id = ? AND failure_count > 0`, actor.organizationId);
  return { active, archived, disposed, eligible, held, activeHolds: holds?.c ?? 0, failedJobs: failed?.c ?? 0 };
}

export function listRetentionActivity(db: AppDatabase, actor: RetentionActor) {
  requirePermission(db, actor, "retention.audit.read");
  return all<{ action: string; resource_id: string | null; actor_id: string; outcome: string; created_at: string }>(
    db,
    `SELECT action, resource_id, actor_id, outcome, created_at FROM access_ledger WHERE organization_id = ? AND (action LIKE 'retention.%' OR action LIKE 'legal-hold.%') ORDER BY sequence`,
    actor.organizationId,
  );
}

export function reconcileRetentionRestore(db: AppDatabase, actor: RetentionActor) {
  requirePermission(db, actor, "retention.execute");
  const revived = all<{ resource_id: string }>(
    db,
    `SELECT t.resource_id FROM retention_tombstones t JOIN retention_records r ON r.id = t.resource_id WHERE t.organization_id = ? AND r.lifecycle_status = 'active'`,
    actor.organizationId,
  );
  for (const row of revived) {
    run(db, `UPDATE retention_records SET lifecycle_status = 'disposed', version = version + 1, updated_at = ? WHERE id = ? AND lifecycle_status = 'active'`, clock(db), row.resource_id);
    ledger(db, actor, "retention.restore-blocked", row.resource_id, "denied");
  }
  return { reconciled: revived.length };
}

export function resumeRetentionJob(db: AppDatabase, actor: RetentionActor, jobId: string, options: { beforeItem?: (resourceId: string) => void } = {}) {
  requirePermission(db, actor, "retention.execute");
  const job = get<{ id: string; organization_id: string; status: string; dry_run_id: string; job_type: string; idempotency_key: string }>(db, `SELECT * FROM retention_jobs WHERE id = ?`, jobId);
  if (!job || job.organization_id !== actor.organizationId) throw new NotFoundError("That retention job is not available.");
  if (job.status === "completed" || job.status === "cancelled") return { jobId, status: job.status, idempotent: true };
  return executeDryRun(db, actor, job.dry_run_id, job.idempotency_key, job.job_type === "archive" ? "archive" : "dispose", options);
}

export const RETENTION_ROLLBACK = `
DROP TABLE IF EXISTS retention_job_items;
DROP TABLE IF EXISTS retention_jobs;
DROP TABLE IF EXISTS retention_plan_items;
DROP TABLE IF EXISTS retention_dry_runs;
DROP TABLE IF EXISTS legal_hold_resources;
DROP TABLE IF EXISTS legal_holds;
DROP TABLE IF EXISTS retention_archives;
DROP TABLE IF EXISTS retention_tombstones;
DROP TABLE IF EXISTS retention_records;
DROP TABLE IF EXISTS retention_policy_versions;
DROP TABLE IF EXISTS retention_policies;
DROP TABLE IF EXISTS retention_controls;
DROP TABLE IF EXISTS privacy_alerts;
DROP TABLE IF EXISTS privacy_erasure_plans;
DROP TABLE IF EXISTS privacy_tombstones;
DROP TABLE IF EXISTS privacy_manifests;
DROP TABLE IF EXISTS privacy_artifacts;
DROP TABLE IF EXISTS privacy_export_items;
DROP TABLE IF EXISTS privacy_exports;
DROP TABLE IF EXISTS privacy_reviews;
DROP TABLE IF EXISTS privacy_verifications;
DROP TABLE IF EXISTS privacy_requests;
DROP TABLE IF EXISTS privacy_record_versions;
DROP TABLE IF EXISTS privacy_records;
DROP TABLE IF EXISTS privacy_authorities;
DROP TABLE IF EXISTS privacy_subjects;
DROP TABLE IF EXISTS privacy_policies;
DROP TABLE IF EXISTS privacy_revoked_sessions;
DROP TABLE IF EXISTS privacy_controls;
DELETE FROM schema_migrations WHERE version IN (35, 36, 37, 38, 39, 40, 41, 42, 43);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (34);
`;
