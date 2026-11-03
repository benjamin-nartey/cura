import { createHash, randomUUID } from "node:crypto";
import { appendAccessLedger } from "./access-ledger";
import { effectivePermissions } from "./authorization";
import type { AppDatabase } from "./db";
import { all, get, run, transaction } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";

export const MINOR_SUBJECT = "sub_minor_kofi";
export const GUARDIAN_AUTHORITY = "auth_guardian_ama";
export const BULK_SUBJECT = "sub_bulk_cohort";
const LARGE_THRESHOLD = 1000;
const BULK_COUNT = 5000;
const BATCH = 500;

type Actor = { userId: string; organizationId: string; facilityId: string | null; sessionId: string };
type RequestRow = {
  id: string;
  organization_id: string;
  facility_id: string | null;
  subject_id: string;
  requester_id: string;
  relationship: string;
  authority_id: string | null;
  request_type: string;
  jurisdiction: string;
  policy_id: string | null;
  policy_version: number | null;
  categories: string;
  approved_categories: string | null;
  status: string;
  verification_state: string;
  decision_state: string;
  correction_field: string | null;
  correction_value: string | null;
  due_at: string | null;
  version: number;
  correlation_id: string;
  idempotency_key: string;
};

const TYPES = new Set(["access", "correction", "portability", "erasure", "bulk"]);
const KEY = /^[A-Za-z0-9_-]{8,80}$/;

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function hasPermission(db: AppDatabase, actor: Actor, permission: string) {
  if (!actor.sessionId || get(db, `SELECT session_id FROM privacy_revoked_sessions WHERE session_id = ?`, actor.sessionId)) return false;
  return effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId).permissions.includes(permission);
}

function requirePermission(db: AppDatabase, actor: Actor, permission: string) {
  if (!actor.sessionId) throw new ForbiddenError("forbidden", "Sign in is required.");
  if (get(db, `SELECT session_id FROM privacy_revoked_sessions WHERE session_id = ?`, actor.sessionId)) {
    throw new ForbiddenError("forbidden", "This session is no longer active.");
  }
  if (!hasPermission(db, actor, permission)) throw new ForbiddenError();
}

function control(db: AppDatabase, name: string) {
  return get<{ value: string }>(db, `SELECT value FROM privacy_controls WHERE name = ?`, name)?.value ?? null;
}

function clock(db: AppDatabase) {
  return control(db, "clock") ?? new Date().toISOString();
}

function blockedEnv() {
  const env = process.env.CURASPHERE_ENV;
  return env === "production" || env === "staging";
}

function ledger(db: AppDatabase, actor: Actor, action: string, resourceId: string, outcome: "success" | "denied") {
  appendAccessLedger(db, {
    organizationId: actor.organizationId,
    facilityId: actor.facilityId,
    actorId: actor.userId,
    subjectId: null,
    action,
    resourceType: "PrivacyRequest",
    resourceId,
    purpose: "AUDIT",
    outcome,
    correlationId: actor.sessionId,
    before: null,
    after: { resourceType: "PrivacyRequest", resourceId, version: "1", fields: ["status"] },
  });
}

function alert(db: AppDatabase, actor: Actor, kind: string, exportId: string | null, recordCount: number) {
  const now = clock(db);
  run(
    db,
    `INSERT INTO privacy_alerts (id, organization_id, export_id, kind, record_count, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    actor.organizationId,
    exportId,
    kind,
    recordCount,
    now,
  );
  run(
    db,
    `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    actor.organizationId,
    "privacy.export.monitor",
    JSON.stringify({ kind, exportId, recordCount }),
    now,
  );
}

function visible(actor: Actor, facilityId: string | null) {
  return actor.facilityId == null || facilityId == null || facilityId === actor.facilityId;
}

export function seedDsar(db: AppDatabase) {
  if (!get(db, `SELECT id FROM organizations WHERE id = 'org_demo_gh'`)) return;
  const policies = [
    ["pol_dsar_gh_access", "org_demo_gh", "SYNTHETIC_GH_DSAR", "access"],
    ["pol_dsar_gh_correction", "org_demo_gh", "SYNTHETIC_GH_DSAR", "correction"],
    ["pol_dsar_gh_portability", "org_demo_gh", "SYNTHETIC_GH_DSAR", "portability"],
    ["pol_dsar_gh_erasure", "org_demo_gh", "SYNTHETIC_GH_DSAR", "erasure"],
    ["pol_dsar_gh_bulk", "org_demo_gh", "SYNTHETIC_BULK_EXPORT", "bulk"],
    ["pol_dsar_eu_access", "org_demo_eu", "SYNTHETIC_EU_DSAR", "access"],
  ] as const;
  for (const [id, organizationId, jurisdiction, requestType] of policies) {
    run(
      db,
      `INSERT INTO privacy_policies (id, organization_id, jurisdiction, request_type, deadline_days, download_hours, large_threshold, approval_state, status, version)
       VALUES (?, ?, ?, ?, 30, 2, ?, 'pending_policy_approval', 'active', 1) ON CONFLICT(id) DO NOTHING`,
      id,
      organizationId,
      jurisdiction,
      requestType,
      LARGE_THRESHOLD,
    );
  }
  const subjects = [
    [MINOR_SUBJECT, "org_demo_gh", "fac_gh_accra", "minor", "synthetic-minor"],
    ["sub_namesake_one", "org_demo_gh", "fac_gh_accra", "adult", "synthetic-namesake"],
    ["sub_namesake_two", "org_demo_gh", "fac_gh_accra", "adult", "synthetic-namesake"],
    [BULK_SUBJECT, "org_demo_gh", "fac_gh_accra", "cohort", "synthetic-cohort"],
    ["sub_eu_noor", "org_demo_eu", "fac_eu_northbridge", "adult", "synthetic-eu-subject"],
  ] as const;
  for (const [id, organizationId, facilityId, kind, label] of subjects) {
    run(
      db,
      `INSERT INTO privacy_subjects (id, organization_id, facility_id, kind, display_label) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      id,
      organizationId,
      facilityId,
      kind,
      label,
    );
  }
  const authorities = [
    [GUARDIAN_AUTHORITY, "org_demo_gh", MINOR_SUBJECT, "grd_ama", "guardian", "active", "access", null],
    ["auth_guardian_wrong", "org_demo_gh", MINOR_SUBJECT, "grd_wrong", "guardian", "revoked", "access", null],
    ["auth_guardian_expired", "org_demo_gh", MINOR_SUBJECT, "grd_old", "guardian", "active", "access", "2020-01-01T00:00:00.000Z"],
    ["auth_bulk_scope", "org_demo_gh", BULK_SUBJECT, "grd_records", "staff-prepared", "active", "bulk", null],
  ] as const;
  for (const [id, organizationId, subjectId, guardianRef, relationship, status, scope, expiresAt] of authorities) {
    run(
      db,
      `INSERT INTO privacy_authorities (id, organization_id, subject_id, guardian_ref, relationship, status, scope, evidence_hash, expires_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING`,
      id,
      organizationId,
      subjectId,
      guardianRef,
      relationship,
      status,
      scope,
      sha(`${id}|${subjectId}`),
      expiresAt,
    );
  }
  const now = "2026-10-14T00:00:00.000Z";
  const records = [
    ["prv_minor_note", "org_demo_gh", "fac_gh_accra", MINOR_SUBJECT, "administrative-note", 0, 0, "synthetic-admin-note"],
    ["prv_minor_third", "org_demo_gh", "fac_gh_accra", MINOR_SUBJECT, "third-party-note", 1, 0, "synthetic-third-party"],
    ["prv_minor_held", "org_demo_gh", "fac_gh_accra", MINOR_SUBJECT, "administrative-note", 0, 1, "synthetic-held-note"],
    ["prv_minor_contact", "org_demo_gh", "fac_gh_accra", MINOR_SUBJECT, "contact-preference", 0, 0, "window"],
    ["prv_namesake_two", "org_demo_gh", "fac_gh_accra", "sub_namesake_two", "administrative-note", 0, 0, "synthetic-other-subject"],
    ["prv_eu_note", "org_demo_eu", "fac_eu_northbridge", "sub_eu_noor", "administrative-note", 0, 0, "synthetic-eu-note"],
  ] as const;
  for (const [id, organizationId, facilityId, subjectId, category, thirdParty, held, payload] of records) {
    run(
      db,
      `INSERT INTO privacy_records (id, organization_id, facility_id, subject_id, category, third_party, held, payload, version, lifecycle_status, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, 'active', ?) ON CONFLICT(id) DO NOTHING`,
      id,
      organizationId,
      facilityId,
      subjectId,
      category,
      thirdParty,
      held,
      payload,
      now,
    );
  }
  run(db, `INSERT INTO privacy_controls (name, value) VALUES ('dependency', 'available') ON CONFLICT(name) DO NOTHING`);
  run(db, `INSERT INTO privacy_controls (name, value) VALUES ('max_records', '6000') ON CONFLICT(name) DO NOTHING`);
  run(db, `INSERT INTO privacy_controls (name, value) VALUES ('quota', '5') ON CONFLICT(name) DO NOTHING`);
}

export function setDsarClock(db: AppDatabase, value: string | null) {
  if (value === null) run(db, `DELETE FROM privacy_controls WHERE name = 'clock'`);
  else run(db, `INSERT INTO privacy_controls (name, value) VALUES ('clock', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, value, value);
}

export function setDsarDependency(db: AppDatabase, value: "available" | "unavailable") {
  run(db, `INSERT INTO privacy_controls (name, value) VALUES ('dependency', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, value, value);
}

export function setDsarLimit(db: AppDatabase, maxRecords: number) {
  run(db, `INSERT INTO privacy_controls (name, value) VALUES ('max_records', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, String(maxRecords), String(maxRecords));
}

export function revokeDsarSession(db: AppDatabase, sessionId: string) {
  run(db, `INSERT INTO privacy_revoked_sessions (session_id, revoked_at) VALUES (?, ?) ON CONFLICT(session_id) DO NOTHING`, sessionId, clock(db));
}

export function revokePrivacyAuthority(db: AppDatabase, authorityId: string) {
  run(db, `UPDATE privacy_authorities SET status = 'revoked' WHERE id = ?`, authorityId);
}

function loadRequest(db: AppDatabase, actor: Actor, id: string) {
  const row = get<RequestRow>(db, `SELECT * FROM privacy_requests WHERE id = ?`, id);
  if (!row || row.organization_id !== actor.organizationId || !visible(actor, row.facility_id)) throw new NotFoundError("That privacy request is not available.");
  return row;
}

export function createPrivacyRequest(
  db: AppDatabase,
  actor: Actor,
  input: {
    requestType: string;
    subjectId: string;
    relationship: string;
    authorityId: string | null;
    jurisdiction: string;
    categories: string[];
    idempotencyKey: string;
    correctionField?: string | null;
    correctionValue?: string | null;
    clientSubjectId?: string | null;
  },
) {
  requirePermission(db, actor, "privacy.request.create");
  if (control(db, "dependency") !== "available") throw new ConflictError("conflict", "Privacy controls are unavailable.");
  if (!TYPES.has(input.requestType)) throw new ValidationError("invalid", "That request type is not valid.");
  if (!KEY.test(input.idempotencyKey)) throw new ValidationError("invalid", "The idempotency key is not valid.");
  if (input.clientSubjectId && input.clientSubjectId !== input.subjectId) throw new ForbiddenError("forbidden", "The subject reference does not match the verified scope.");
  const existing = get<RequestRow>(db, `SELECT * FROM privacy_requests WHERE organization_id = ? AND idempotency_key = ?`, actor.organizationId, input.idempotencyKey);
  if (existing) return { id: existing.id, status: existing.status, idempotent: true as const };
  const subject = get<{ id: string; organization_id: string; facility_id: string | null }>(db, `SELECT id, organization_id, facility_id FROM privacy_subjects WHERE id = ?`, input.subjectId);
  if (!subject || subject.organization_id !== actor.organizationId || !visible(actor, subject.facility_id)) throw new NotFoundError("That privacy subject is not available.");
  if (input.relationship === "guardian" || input.requestType === "bulk") {
    const authority = authorityRow(db, input.authorityId);
    if (!authority || authority.subject_id !== subject.id || authority.organization_id !== actor.organizationId) throw new ForbiddenError("forbidden", "Representative authority was not found.");
  }
  const policy = get<{ id: string; version: number; deadline_days: number; jurisdiction: string }>(
    db,
    `SELECT id, version, deadline_days, jurisdiction FROM privacy_policies WHERE organization_id = ? AND request_type = ? AND jurisdiction = ? AND status = 'active'`,
    actor.organizationId,
    input.requestType,
    input.jurisdiction,
  );
  const now = clock(db);
  const due = policy ? new Date(Date.parse(now) + policy.deadline_days * 86400000).toISOString() : null;
  const id = `dsr_${input.idempotencyKey}`;
  const status = policy ? "verification_pending" : "policy_review_required";
  run(
    db,
    `INSERT INTO privacy_requests (
      id, organization_id, facility_id, subject_id, requester_id, relationship, authority_id, request_type, jurisdiction,
      policy_id, policy_version, categories, approved_categories, status, verification_state, decision_state,
      correction_field, correction_value, due_at, version, correlation_id, idempotency_key, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'pending', 'pending', ?, ?, ?, 1, ?, ?, ?, ?)`,
    id,
    actor.organizationId,
    actor.facilityId ?? subject.facility_id,
    subject.id,
    actor.userId,
    input.relationship,
    input.authorityId,
    input.requestType,
    input.jurisdiction,
    policy?.id ?? null,
    policy?.version ?? null,
    input.categories.join(","),
    status,
    input.correctionField ?? null,
    input.correctionValue ?? null,
    due,
    actor.sessionId,
    input.idempotencyKey,
    now,
    now,
  );
  ledger(db, actor, "privacy.request.create", id, "success");
  return { id, status, idempotent: false as const };
}

function authorityRow(db: AppDatabase, id: string | null) {
  if (!id) return undefined;
  return get<{ id: string; organization_id: string; subject_id: string; guardian_ref: string; status: string; expires_at: string | null; evidence_hash: string }>(
    db,
    `SELECT * FROM privacy_authorities WHERE id = ?`,
    id,
  );
}

export function verifyPrivacyRequest(db: AppDatabase, actor: Actor, id: string, input: { method: string; authorityId: string | null; email?: string | null; expectedVersion: number }) {
  requirePermission(db, actor, "privacy.request.verify");
  if (control(db, "dependency") !== "available") throw new ConflictError("conflict", "Privacy controls are unavailable.");
  const request = loadRequest(db, actor, id);
  if (request.version !== input.expectedVersion) throw new ConflictError("conflict", "The privacy request changed.");
  if (request.status !== "verification_pending") throw new ConflictError("conflict", "That request is not waiting for verification.");
  const now = clock(db);
  if (input.method === "email-match" || input.email) {
    run(db, `INSERT INTO privacy_verifications (id, request_id, method, result, verifier_id, evidence_hash, verified_at) VALUES (?, ?, 'email-match', 'failed', ?, NULL, ?)`, randomUUID(), id, actor.userId, now);
    ledger(db, actor, "privacy.verify", id, "denied");
    throw new ForbiddenError("forbidden", "An email match does not establish subject authority.");
  }
  const authority = authorityRow(db, input.authorityId ?? request.authority_id);
  const expired = authority?.expires_at != null && Date.parse(authority.expires_at) <= Date.parse(now);
  const ok = Boolean(authority && authority.status === "active" && !expired && authority.subject_id === request.subject_id && authority.organization_id === actor.organizationId);
  run(
    db,
    `INSERT INTO privacy_verifications (id, request_id, method, result, verifier_id, evidence_hash, verified_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    id,
    input.method,
    ok ? "verified" : "failed",
    actor.userId,
    authority?.evidence_hash ?? null,
    now,
  );
  if (!ok) {
    ledger(db, actor, "privacy.verify", id, "denied");
    throw new ForbiddenError("forbidden", "Representative authority is missing, expired, or revoked.");
  }
  run(db, `UPDATE privacy_requests SET status = 'verified', verification_state = 'verified', authority_id = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, authority?.id ?? null, now, id, request.version);
  ledger(db, actor, "privacy.verify", id, "success");
  return { id, status: "verified" as const, version: request.version + 1 };
}

export function approvePrivacyRequest(db: AppDatabase, actor: Actor, id: string, expectedVersion: number, mode: "full" | "partial") {
  if (!hasPermission(db, actor, "privacy.request.approve") && !hasPermission(db, actor, "privacy.bulk.approve")) throw new ForbiddenError();
  const request = loadRequest(db, actor, id);
  if (actor.userId === request.requester_id) throw new ForbiddenError("forbidden", "The requester cannot approve this request.");
  if (request.version !== expectedVersion) throw new ConflictError("conflict", "The privacy request changed.");
  if (!request.policy_id) throw new ConflictError("conflict", "A privacy policy is required before approval.");
  if (request.request_type === "bulk") seedBulkRecords(db, actor.organizationId);
  const estimate = countSubjectRecords(db, request);
  const large = request.request_type === "bulk" || estimate >= LARGE_THRESHOLD;
  if (request.status === "verified") requirePermission(db, actor, "privacy.request.approve");
  else if (request.status === "elevated_review") requirePermission(db, actor, "privacy.bulk.approve");
  else throw new ConflictError("conflict", "That request cannot be approved.");
  if (request.status === "elevated_review") {
    const first = get<{ reviewer_id: string }>(db, `SELECT reviewer_id FROM privacy_reviews WHERE request_id = ? ORDER BY reviewed_at LIMIT 1`, id);
    if (first && first.reviewer_id === actor.userId) throw new ForbiddenError("forbidden", "Elevated review needs a different reviewer.");
  }
  const requested = request.categories.split(",").filter(Boolean);
  const approved = requested.filter((category) => category !== "research-note" && (mode === "full" || category !== "third-party-note"));
  const now = clock(db);
  const next = large && request.status === "verified" ? "elevated_review" : mode === "partial" ? "partially_approved" : "approved";
  const changed = run(
    db,
    `UPDATE privacy_requests SET status = ?, decision_state = ?, approved_categories = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`,
    next,
    next,
    approved.join(","),
    now,
    id,
    expectedVersion,
  );
  if (changed.changes !== 1) throw new ConflictError("conflict", "The privacy request changed.");
  run(db, `INSERT INTO privacy_reviews (id, request_id, reviewer_id, decision, reason_code, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)`, randomUUID(), id, actor.userId, next, mode, now);
  if (large && request.status === "verified") alert(db, actor, "large-export-review", null, estimate);
  ledger(db, actor, "privacy.approve", id, "success");
  return { id, status: next, version: expectedVersion + 1, estimate };
}

export function denyPrivacyRequest(db: AppDatabase, actor: Actor, id: string, expectedVersion: number, reasonCode: string) {
  requirePermission(db, actor, "privacy.request.approve");
  const request = loadRequest(db, actor, id);
  if (request.version !== expectedVersion) throw new ConflictError("conflict", "The privacy request changed.");
  if (!["verified", "elevated_review", "verification_pending"].includes(request.status)) throw new ConflictError("conflict", "That request cannot be denied.");
  const now = clock(db);
  const changed = run(db, `UPDATE privacy_requests SET status = 'denied', decision_state = 'denied', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = ?`, now, id, expectedVersion, request.status);
  if (changed.changes !== 1) throw new ConflictError("conflict", "The privacy request changed.");
  run(db, `INSERT INTO privacy_reviews (id, request_id, reviewer_id, decision, reason_code, reviewed_at) VALUES (?, ?, ?, 'denied', ?, ?)`, randomUUID(), id, actor.userId, reasonCode, now);
  ledger(db, actor, "privacy.deny", id, "success");
  return { id, status: "denied" as const };
}

export function cancelPrivacyRequest(db: AppDatabase, actor: Actor, id: string, expectedVersion: number) {
  requirePermission(db, actor, "privacy.request.create");
  const request = loadRequest(db, actor, id);
  if (request.requester_id !== actor.userId) throw new ForbiddenError();
  if (request.version !== expectedVersion) throw new ConflictError("conflict", "The privacy request changed.");
  if (["fulfilled", "closed", "denied"].includes(request.status)) throw new ConflictError("conflict", "That request can no longer be cancelled.");
  run(db, `UPDATE privacy_requests SET status = 'cancelled', decision_state = 'cancelled', version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, clock(db), id, expectedVersion);
  run(db, `UPDATE privacy_exports SET status = 'cancelled' WHERE request_id = ? AND status IN ('queued', 'running')`, id);
  ledger(db, actor, "privacy.cancel", id, "success");
  return { id, status: "cancelled" as const };
}

function countSubjectRecords(db: AppDatabase, request: RequestRow) {
  const row = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM privacy_records WHERE organization_id = ? AND subject_id = ? AND lifecycle_status = 'active'`, request.organization_id, request.subject_id);
  return Number(row?.c ?? 0);
}

function seedBulkRecords(db: AppDatabase, organizationId: string) {
  const existing = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM privacy_records WHERE subject_id = ?`, BULK_SUBJECT);
  if (Number(existing?.c ?? 0) >= BULK_COUNT) return { count: BULK_COUNT, idempotent: true as const };
  const now = clock(db);
  const insert = db.prepare(
    `INSERT INTO privacy_records (id, organization_id, facility_id, subject_id, category, third_party, held, payload, version, lifecycle_status, updated_at)
     VALUES (?, ?, 'fac_gh_accra', ?, ?, ?, ?, ?, 1, 'active', ?) ON CONFLICT(id) DO NOTHING`,
  );
  transaction(db, () => {
    for (let index = 0; index < BULK_COUNT; index += 1) {
      const category = index < 4800 ? "administrative-note" : index < 4900 ? "third-party-note" : index < 4950 ? "administrative-note" : "research-note";
      insert.run(`prv_bulk_${index}`, organizationId, BULK_SUBJECT, category, category === "third-party-note" ? 1 : 0, index >= 4900 && index < 4950 ? 1 : 0, `synthetic-bulk-${index}`, now);
    }
  });
  return { count: BULK_COUNT, idempotent: false as const };
}

export function ensureBulkDataset(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.request.create");
  return seedBulkRecords(db, actor.organizationId);
}

export function queueExport(db: AppDatabase, actor: Actor, requestId: string, idempotencyKey: string, clientSubjectId?: string | null) {
  requirePermission(db, actor, "privacy.export.run");
  if (blockedEnv()) throw new ForbiddenError("forbidden", "Export delivery is disabled in this environment.");
  if (control(db, "dependency") !== "available") throw new ConflictError("conflict", "Privacy controls are unavailable.");
  if (!KEY.test(idempotencyKey)) throw new ValidationError("invalid", "The idempotency key is not valid.");
  const request = loadRequest(db, actor, requestId);
  if (clientSubjectId && clientSubjectId !== request.subject_id) {
    ledger(db, actor, "privacy.export.denied", requestId, "denied");
    throw new ForbiddenError("forbidden", "That subject is outside the approved request.");
  }
  if (!["approved", "partially_approved"].includes(request.status)) throw new ConflictError("conflict", "The request is not approved for export.");
  const existing = get<{ id: string; status: string }>(db, `SELECT id, status FROM privacy_exports WHERE organization_id = ? AND idempotency_key = ?`, actor.organizationId, idempotencyKey);
  if (existing) return { id: existing.id, status: existing.status, idempotent: true as const };
  const quota = Number(control(db, "quota") ?? "5");
  const prior = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM privacy_exports WHERE organization_id = ?`, actor.organizationId);
  if (Number(prior?.c ?? 0) >= quota) throw new ConflictError("conflict", "The export quota for this organization is reached.");
  if (request.request_type === "bulk") seedBulkRecords(db, actor.organizationId);
  const estimate = countSubjectRecords(db, request);
  const monitoring = estimate >= LARGE_THRESHOLD ? "large" : "standard";
  const now = clock(db);
  const id = `exp_${idempotencyKey}`;
  const hours = get<{ download_hours: number }>(db, `SELECT download_hours FROM privacy_policies WHERE id = ?`, request.policy_id ?? "")?.download_hours ?? 2;
  const expires = new Date(Date.parse(now) + hours * 3600000).toISOString();
  run(
    db,
    `INSERT INTO privacy_exports (
      id, organization_id, request_id, requester_id, downloader_id, subject_id, status, cursor_index, record_count, byte_count,
      monitoring, idempotency_key, correlation_id, worker_token, error_code, expires_at, created_at, finished_at
    ) VALUES (?, ?, ?, ?, ?, ?, 'queued', 0, 0, 0, ?, ?, ?, NULL, NULL, ?, ?, NULL)`,
    id,
    actor.organizationId,
    request.id,
    request.requester_id,
    request.requester_id,
    request.subject_id,
    monitoring,
    idempotencyKey,
    actor.sessionId,
    expires,
    now,
  );
  if (monitoring === "large") alert(db, actor, "large-export-requested", id, estimate);
  const repeated = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM privacy_alerts WHERE organization_id = ? AND kind = 'large-export-requested'`, actor.organizationId);
  if (Number(repeated?.c ?? 0) > 1) alert(db, actor, "suspicious-repeat", id, estimate);
  ledger(db, actor, "privacy.export.queue", id, "success");
  return { id, status: "queued" as const, monitoring, idempotent: false as const };
}

type RecordRow = { id: string; organization_id: string; facility_id: string; subject_id: string; category: string; third_party: number; held: number; payload: string; lifecycle_status: string; version: number };

export function runExport(db: AppDatabase, actor: Actor, exportId: string, options: { beforeBatch?: (cursor: number) => void } = {}) {
  requirePermission(db, actor, "privacy.export.run");
  if (blockedEnv()) throw new ForbiddenError("forbidden", "Export delivery is disabled in this environment.");
  if (control(db, "dependency") !== "available") throw new ConflictError("conflict", "Privacy controls are unavailable.");
  const job = get<{ id: string; organization_id: string; request_id: string; subject_id: string; status: string; cursor_index: number; monitoring: string; expires_at: string; downloader_id: string; worker_token: string | null }>(db, `SELECT * FROM privacy_exports WHERE id = ?`, exportId);
  if (!job || job.organization_id !== actor.organizationId) throw new NotFoundError("That export is not available.");
  if (job.status === "ready" || job.status === "fulfilled") return { id: exportId, status: job.status, idempotent: true as const };
  if (job.status === "cancelled" || job.status === "revoked" || job.status === "blocked") throw new ConflictError("conflict", "That export cannot be generated.");
  if (job.status === "running" && job.worker_token && job.worker_token !== actor.sessionId) {
    return { id: exportId, status: "running" as const, idempotent: false as const, claimed: false as const };
  }
  const request = loadRequest(db, actor, job.request_id);
  if (!["approved", "partially_approved"].includes(request.status) && request.status !== "processing") throw new ConflictError("conflict", "The request is not approved for export.");
  if (job.status === "queued") {
    const claim = run(db, `UPDATE privacy_exports SET status = 'running', worker_token = ? WHERE id = ? AND status = 'queued'`, actor.sessionId, exportId);
    if (claim.changes !== 1) return { id: exportId, status: "running" as const, idempotent: false as const, claimed: false as const };
  } else if (job.worker_token && job.worker_token !== actor.sessionId) {
    return { id: exportId, status: "running" as const, idempotent: false as const, claimed: false as const };
  }
  run(db, `UPDATE privacy_requests SET status = 'processing', updated_at = ? WHERE id = ?`, clock(db), request.id);
  const approved = new Set((request.approved_categories ?? "").split(",").filter(Boolean));
  const records = all<RecordRow>(
    db,
    `SELECT * FROM privacy_records WHERE organization_id = ? AND subject_id = ? AND facility_id = ? AND lifecycle_status = 'active' ORDER BY id`,
    actor.organizationId,
    job.subject_id,
    request.facility_id ?? actor.facilityId ?? "",
  );
  let cursor = job.cursor_index;
  while (cursor < records.length) {
    options.beforeBatch?.(cursor);
    const slice = records.slice(cursor, cursor + BATCH);
    for (const row of slice) {
      if (get(db, `SELECT record_id FROM privacy_export_items WHERE export_id = ? AND record_id = ?`, exportId, row.id)) continue;
      const outcome = !approved.has(row.category) ? "excluded-policy" : row.held ? "excluded-hold" : row.organization_id !== actor.organizationId ? "excluded-tenant" : "included";
      run(db, `INSERT INTO privacy_export_items (export_id, record_id, outcome) VALUES (?, ?, ?)`, exportId, row.id, outcome);
    }
    cursor += slice.length;
    run(db, `UPDATE privacy_exports SET cursor_index = ? WHERE id = ?`, cursor, exportId);
  }
  const included = all<{ record_id: string }>(db, `SELECT record_id FROM privacy_export_items WHERE export_id = ? AND outcome = 'included' ORDER BY record_id`, exportId);
  const max = Number(control(db, "max_records") ?? "6000");
  if (included.length > max) {
    run(db, `UPDATE privacy_exports SET status = 'blocked', error_code = 'unexpected-size', finished_at = ? WHERE id = ?`, clock(db), exportId);
    alert(db, actor, "unexpected-size", exportId, included.length);
    ledger(db, actor, "privacy.export.blocked", exportId, "denied");
    return { id: exportId, status: "blocked" as const, count: included.length };
  }
  const rows = included.map((item) => {
    const source = records.find((row) => row.id === item.record_id);
    return { id: item.record_id, category: source?.category ?? "", payload: source?.third_party ? "[redacted]" : source?.payload ?? "" };
  });
  const foreign = rows.filter((row) => {
    const source = records.find((candidate) => candidate.id === row.id);
    return source != null && source.subject_id !== job.subject_id;
  });
  if (foreign.length > 0) throw new ForbiddenError("forbidden", "The export selected another subject's record.");
  const body = JSON.stringify({ subjectId: job.subject_id, records: rows });
  const checksum = sha(body);
  const excluded = all<{ outcome: string; c: number }>(db, `SELECT outcome, COUNT(*) AS c FROM privacy_export_items WHERE export_id = ? AND outcome != 'included' GROUP BY outcome`, exportId);
  const manifest = {
    exportId,
    subjectId: job.subject_id,
    policyId: request.policy_id,
    policyVersion: request.policy_version,
    schemaVersion: 36,
    included: rows.length,
    excluded,
    checksum,
    generatedAt: clock(db),
  };
  const now = clock(db);
  run(
    db,
    `INSERT INTO privacy_artifacts (id, export_id, format, payload, checksum, byte_count, access_state, download_count, created_at, expires_at, cleaned_at)
     VALUES (?, ?, 'json', ?, ?, ?, 'ready', 0, ?, ?, NULL)
     ON CONFLICT(export_id) DO UPDATE SET payload = excluded.payload, checksum = excluded.checksum, byte_count = excluded.byte_count`,
    randomUUID(),
    exportId,
    body,
    checksum,
    body.length,
    now,
    job.expires_at,
  );
  run(db, `INSERT INTO privacy_manifests (export_id, body, checksum) VALUES (?, ?, ?) ON CONFLICT(export_id) DO UPDATE SET body = excluded.body, checksum = excluded.checksum`, exportId, JSON.stringify(manifest), sha(JSON.stringify(manifest)));
  run(db, `UPDATE privacy_exports SET status = 'ready', record_count = ?, byte_count = ?, finished_at = ?, worker_token = NULL WHERE id = ?`, rows.length, body.length, now, exportId);
  run(db, `UPDATE privacy_requests SET status = 'ready', updated_at = ? WHERE id = ?`, now, request.id);
  if (job.monitoring === "large") alert(db, actor, "large-export-completed", exportId, rows.length);
  ledger(db, actor, "privacy.export.generate", exportId, "success");
  return { id: exportId, status: "ready" as const, count: rows.length, checksum, idempotent: false as const };
}

export function downloadExport(db: AppDatabase, actor: Actor, exportId: string) {
  if (!hasPermission(db, actor, "privacy.export.download")) {
    const visibleJob = get<{ organization_id: string }>(db, `SELECT organization_id FROM privacy_exports WHERE id = ?`, exportId);
    if (visibleJob && visibleJob.organization_id === actor.organizationId && actor.sessionId && !get(db, `SELECT session_id FROM privacy_revoked_sessions WHERE session_id = ?`, actor.sessionId)) {
      ledger(db, actor, "privacy.download", exportId, "denied");
    }
    throw new ForbiddenError();
  }
  requirePermission(db, actor, "privacy.export.download");
  if (blockedEnv()) throw new ForbiddenError("forbidden", "Export delivery is disabled in this environment.");
  const job = get<{ id: string; organization_id: string; request_id: string; downloader_id: string; subject_id: string; status: string; expires_at: string }>(db, `SELECT * FROM privacy_exports WHERE id = ?`, exportId);
  if (!job || job.organization_id !== actor.organizationId) throw new NotFoundError("That export is not available.");
  const request = loadRequest(db, actor, job.request_id);
  if (actor.userId !== job.downloader_id) {
    ledger(db, actor, "privacy.download", exportId, "denied");
    throw new ForbiddenError("forbidden", "This account is not the authorized downloader.");
  }
  if (job.status === "revoked" || job.status === "cancelled" || job.status === "blocked") {
    ledger(db, actor, "privacy.download", exportId, "denied");
    throw new ForbiddenError("forbidden", "This export is not available for download.");
  }
  if (Date.parse(clock(db)) > Date.parse(job.expires_at)) {
    ledger(db, actor, "privacy.download", exportId, "denied");
    throw new ConflictError("conflict", "This export has expired.");
  }
  const authority = authorityRow(db, request.authority_id);
  if (request.authority_id && (!authority || authority.status !== "active" || (authority.expires_at != null && Date.parse(authority.expires_at) <= Date.parse(clock(db))))) {
    ledger(db, actor, "privacy.download", exportId, "denied");
    throw new ForbiddenError("forbidden", "The authority for this download is no longer active.");
  }
  const artifact = get<{ payload: string; checksum: string; format: string; created_at: string; expires_at: string; access_state: string }>(db, `SELECT * FROM privacy_artifacts WHERE export_id = ?`, exportId);
  if (!artifact || artifact.access_state !== "ready") throw new NotFoundError("That export artifact is not available.");
  if (sha(artifact.payload) !== artifact.checksum) {
    ledger(db, actor, "privacy.download", exportId, "denied");
    throw new ConflictError("conflict", "The export artifact no longer matches its checksum.");
  }
  const parsed = JSON.parse(artifact.payload) as { subjectId: string; records: Array<{ id: string; payload: string }> };
  if (parsed.subjectId !== job.subject_id || parsed.records.some((row) => row.payload.includes("synthetic-other-subject"))) {
    throw new ForbiddenError("forbidden", "The export failed the subject check.");
  }
  run(db, `UPDATE privacy_artifacts SET download_count = download_count + 1 WHERE export_id = ?`, exportId);
  run(db, `UPDATE privacy_exports SET status = 'fulfilled' WHERE id = ? AND status = 'ready'`, exportId);
  run(db, `UPDATE privacy_requests SET status = 'fulfilled', updated_at = ? WHERE id = ?`, clock(db), request.id);
  ledger(db, actor, "privacy.download", exportId, "success");
  return { format: artifact.format, createdAt: artifact.created_at, expiresAt: artifact.expires_at, subjectId: parsed.subjectId, count: parsed.records.length, records: parsed.records };
}

export function revokeExport(db: AppDatabase, actor: Actor, exportId: string) {
  requirePermission(db, actor, "privacy.export.revoke");
  const job = get<{ id: string; organization_id: string }>(db, `SELECT id, organization_id FROM privacy_exports WHERE id = ?`, exportId);
  if (!job || job.organization_id !== actor.organizationId) throw new NotFoundError("That export is not available.");
  run(db, `UPDATE privacy_exports SET status = 'revoked' WHERE id = ?`, exportId);
  run(db, `UPDATE privacy_artifacts SET access_state = 'revoked' WHERE export_id = ?`, exportId);
  ledger(db, actor, "privacy.export.revoke", exportId, "success");
  return { id: exportId, status: "revoked" as const };
}

export function cleanupExpiredExports(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.export.revoke");
  const now = clock(db);
  const rows = all<{ export_id: string }>(db, `SELECT a.export_id FROM privacy_artifacts a JOIN privacy_exports e ON e.id = a.export_id WHERE e.organization_id = ? AND a.expires_at < ? AND a.cleaned_at IS NULL`, actor.organizationId, now);
  for (const row of rows) {
    const held = get(db, `SELECT id FROM legal_holds WHERE organization_id = ? AND status = 'active' AND scope_ref = ?`, actor.organizationId, row.export_id);
    if (held) {
      run(db, `UPDATE privacy_artifacts SET access_state = 'retained-no-download', cleaned_at = ? WHERE export_id = ?`, now, row.export_id);
    } else {
      run(db, `UPDATE privacy_artifacts SET payload = '', access_state = 'cleaned', cleaned_at = ? WHERE export_id = ?`, now, row.export_id);
    }
    run(db, `UPDATE privacy_exports SET status = 'expired' WHERE id = ? AND status NOT IN ('revoked', 'blocked')`, row.export_id);
    ledger(db, actor, "privacy.export.cleanup", row.export_id, "success");
  }
  return { cleaned: rows.length, retainedCopies: "archive-and-backup-not-verified" as const };
}

export function applyCorrection(db: AppDatabase, actor: Actor, requestId: string) {
  requirePermission(db, actor, "privacy.request.approve");
  const request = loadRequest(db, actor, requestId);
  if (!["approved", "partially_approved"].includes(request.status) && request.status !== "ready") throw new ConflictError("conflict", "The correction is not approved.");
  if (request.request_type !== "correction" || !request.correction_field || !request.correction_value) throw new ValidationError("invalid", "The correction is incomplete.");
  const record = get<{ id: string; version: number; payload: string; category: string }>(
    db,
    `SELECT id, version, payload, category FROM privacy_records WHERE organization_id = ? AND subject_id = ? AND category = 'contact-preference' AND lifecycle_status = 'active'`,
    actor.organizationId,
    request.subject_id,
  );
  if (!record) throw new NotFoundError("The supported synthetic record is not available.");
  const now = clock(db);
  run(db, `INSERT INTO privacy_record_versions (id, record_id, version, payload, changed_at, changed_by) VALUES (?, ?, ?, ?, ?, ?)`, randomUUID(), record.id, record.version, record.payload, now, actor.userId);
  const changed = run(db, `UPDATE privacy_records SET payload = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, request.correction_value, now, record.id, record.version);
  if (changed.changes !== 1) throw new ConflictError("conflict", "The source record changed.");
  run(db, `UPDATE privacy_requests SET status = 'fulfilled', updated_at = ? WHERE id = ?`, now, request.id);
  ledger(db, actor, "privacy.correction", record.id, "success");
  return { recordId: record.id, previous: record.payload, version: record.version + 1 };
}

function erasureHeld(db: AppDatabase, organizationId: string, record: RecordRow) {
  if (record.held) return true;
  if (record.category === "audit-ledger" || record.category === "consent-history" || record.category === "research-note") return true;
  return Boolean(get(db, `SELECT id FROM legal_holds WHERE organization_id = ? AND status = 'active' AND (scope_ref = ? OR scope_ref = ?)`, organizationId, record.id, record.category));
}

export function planErasure(db: AppDatabase, actor: Actor, requestId: string) {
  requirePermission(db, actor, "privacy.request.approve");
  const request = loadRequest(db, actor, requestId);
  if (request.request_type !== "erasure") throw new ValidationError("invalid", "That request is not an erasure request.");
  if (!["approved", "partially_approved"].includes(request.status)) throw new ConflictError("conflict", "The erasure request is not approved.");
  const records = all<RecordRow>(db, `SELECT * FROM privacy_records WHERE organization_id = ? AND subject_id = ? AND lifecycle_status = 'active' ORDER BY id`, actor.organizationId, request.subject_id);
  const eligible = records.filter((row) => !erasureHeld(db, actor.organizationId, row));
  const planHash = sha(records.map((row) => `${row.id}:${row.version}:${erasureHeld(db, actor.organizationId, row) ? "hold" : "eligible"}`).join("|"));
  const id = `era_${request.id}`;
  run(
    db,
    `INSERT INTO privacy_erasure_plans (id, request_id, plan_hash, eligible_count, blocked_count, status, created_at) VALUES (?, ?, ?, ?, ?, 'open', ?)
     ON CONFLICT(id) DO UPDATE SET plan_hash = excluded.plan_hash, eligible_count = excluded.eligible_count, blocked_count = excluded.blocked_count`,
    id,
    request.id,
    planHash,
    eligible.length,
    records.length - eligible.length,
    clock(db),
  );
  ledger(db, actor, "privacy.erasure.plan", id, "success");
  return { id, eligible: eligible.length, blocked: records.length - eligible.length, planHash };
}

export function executeErasure(db: AppDatabase, actor: Actor, requestId: string, planId: string) {
  requirePermission(db, actor, "privacy.export.run");
  if (blockedEnv()) throw new ForbiddenError("forbidden", "Erasure is disabled in this environment.");
  const request = loadRequest(db, actor, requestId);
  const plan = get<{ id: string; request_id: string; plan_hash: string; status: string }>(db, `SELECT * FROM privacy_erasure_plans WHERE id = ?`, planId);
  if (!plan || plan.request_id !== request.id) throw new NotFoundError("That erasure plan is not available.");
  const records = all<RecordRow>(db, `SELECT * FROM privacy_records WHERE organization_id = ? AND subject_id = ? AND lifecycle_status = 'active' ORDER BY id`, actor.organizationId, request.subject_id);
  const current = sha(records.map((row) => `${row.id}:${row.version}:${erasureHeld(db, actor.organizationId, row) ? "hold" : "eligible"}`).join("|"));
  if (current !== plan.plan_hash) throw new ConflictError("conflict", "A hold or record changed after the erasure preview.");
  let disposed = 0;
  let blocked = 0;
  const now = clock(db);
  for (const row of records) {
    if (erasureHeld(db, actor.organizationId, row)) {
      blocked += 1;
      continue;
    }
    const changed = run(db, `UPDATE privacy_records SET lifecycle_status = 'disposed', version = version + 1, updated_at = ? WHERE id = ? AND lifecycle_status = 'active'`, now, row.id);
    if (changed.changes === 1) {
      run(db, `INSERT INTO privacy_tombstones (record_id, organization_id, request_id, disposed_at) VALUES (?, ?, ?, ?) ON CONFLICT(record_id) DO NOTHING`, row.id, actor.organizationId, request.id, now);
      disposed += 1;
    }
  }
  const outcome = blocked > 0 ? "partial" : "fulfilled";
  run(db, `UPDATE privacy_erasure_plans SET status = 'executed' WHERE id = ?`, plan.id);
  run(db, `UPDATE privacy_requests SET status = ?, decision_state = ?, updated_at = ? WHERE id = ?`, outcome === "partial" ? "partially_approved" : "fulfilled", outcome, now, request.id);
  ledger(db, actor, "privacy.erasure.execute", request.id, "success");
  return { disposed, blocked, outcome, retainedCopies: "archive-and-backup-not-verified" as const };
}

export function readPrivacyRequest(db: AppDatabase, actor: Actor, id: string) {
  requirePermission(db, actor, "privacy.request.read");
  return loadRequest(db, actor, id);
}

export function listPrivacyRequests(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.request.read");
  const rows = all<RequestRow>(db, `SELECT * FROM privacy_requests WHERE organization_id = ? ORDER BY created_at`, actor.organizationId);
  return rows.filter((row) => visible(actor, row.facility_id));
}

export function privacyOverview(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.request.read");
  const rows = listPrivacyRequests(db, actor);
  const now = Date.parse(clock(db));
  return {
    total: rows.length,
    pendingVerification: rows.filter((row) => row.status === "verification_pending").length,
    review: rows.filter((row) => row.status === "verified" || row.status === "elevated_review").length,
    approved: rows.filter((row) => row.status === "approved" || row.status === "partially_approved").length,
    processing: rows.filter((row) => row.status === "processing").length,
    fulfilled: rows.filter((row) => row.status === "fulfilled" || row.status === "ready").length,
    denied: rows.filter((row) => row.status === "denied").length,
    overdue: rows.filter((row) => row.due_at != null && Date.parse(row.due_at) < now && !["fulfilled", "denied", "cancelled", "closed"].includes(row.status)).length,
  };
}

export function readExport(db: AppDatabase, actor: Actor, id: string) {
  requirePermission(db, actor, "privacy.request.read");
  const row = get<{ id: string; organization_id: string; status: string; monitoring: string; record_count: number; subject_id: string; expires_at: string | null; downloader_id: string; request_id: string }>(db, `SELECT id, organization_id, status, monitoring, record_count, subject_id, expires_at, downloader_id, request_id FROM privacy_exports WHERE id = ?`, id);
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That export is not available.");
  const manifest = get<{ body: string }>(db, `SELECT body FROM privacy_manifests WHERE export_id = ?`, id);
  return { ...row, manifest: manifest?.body ?? null };
}

export function listPrivacyAlerts(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.audit.read");
  return all<{ id: string; kind: string; export_id: string | null; record_count: number; created_at: string }>(db, `SELECT id, kind, export_id, record_count, created_at FROM privacy_alerts WHERE organization_id = ? ORDER BY created_at`, actor.organizationId);
}

export function listPrivacyActivity(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "privacy.audit.read");
  return all<{ action: string; resource_id: string | null; outcome: string; actor_id: string }>(
    db,
    `SELECT action, resource_id, outcome, actor_id FROM access_ledger WHERE organization_id = ? AND action LIKE 'privacy.%' ORDER BY created_at`,
    actor.organizationId,
  );
}

export const DSAR_ROLLBACK = `
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
DROP TABLE IF EXISTS privacy_telemetry_sink;
DROP TABLE IF EXISTS privacy_alert_events;
DROP TABLE IF EXISTS privacy_security_alerts;
DROP TABLE IF EXISTS privacy_signal_rules;
DROP TABLE IF EXISTS privacy_telemetry_policies;
DROP TABLE IF EXISTS privacy_telemetry_health;
DELETE FROM schema_migrations WHERE version IN (36, 37, 38, 39, 40, 41, 42, 43);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (35);
`;
