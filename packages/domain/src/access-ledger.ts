import { createHash, randomUUID } from "node:crypto";
import type { AppDatabase } from "./db";
import { all, get, run } from "./db";
import { ForbiddenError, ValidationError } from "./errors";
import { effectivePermissions } from "./authorization";

const GENESIS = "ledger-genesis";
const ALLOWED_META = new Set(["resourceType", "resourceId", "version", "fields"]);

export const LEDGER_ROLLBACK = `
DROP TRIGGER IF EXISTS consent_versions_no_delete;
DROP TRIGGER IF EXISTS consent_versions_no_update;
DROP TABLE IF EXISTS consent_cache;
DROP TABLE IF EXISTS consent_sink;
DROP TABLE IF EXISTS consent_dispatches;
DROP TABLE IF EXISTS consent_withdrawals;
DROP TABLE IF EXISTS consent_versions;
DROP TABLE IF EXISTS consent_directives;
DROP TABLE IF EXISTS consent_authorities;
DROP TABLE IF EXISTS consent_policies;
DROP TABLE IF EXISTS consent_subjects;
DROP TABLE IF EXISTS consent_controls;
DROP TABLE IF EXISTS consent_idempotency;
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
DROP TRIGGER IF EXISTS access_ledger_no_delete;
DROP TRIGGER IF EXISTS access_ledger_no_update;
DROP TABLE IF EXISTS access_ledger;
DELETE FROM schema_migrations WHERE version IN (33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (32);
`;

type LedgerMeta = { resourceType: string; resourceId: string; version: string; fields: string[] };

export type LedgerEntry = {
  sequence: number;
  id: string;
  organizationId: string;
  facilityId: string | null;
  actorId: string;
  subjectId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  purpose: string;
  outcome: string;
  correlationId: string;
  beforeHash: string;
  afterHash: string;
  previousHash: string;
  entryHash: string;
  createdAt: string;
};

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function metadataHash(meta: LedgerMeta | null) {
  if (!meta) return sha("none");
  for (const [key, value] of Object.entries(meta)) {
    if (!ALLOWED_META.has(key)) throw new ValidationError("invalid", "Ledger metadata contains a field that is not permitted.");
    if (typeof value === "string" && (value.length > 80 || /\s/.test(value))) {
      throw new ValidationError("invalid", "Ledger metadata stores an identifier, not descriptive text.");
    }
    if (Array.isArray(value) && value.some((item) => typeof item !== "string" || item.length > 40 || /\s/.test(item))) {
      throw new ValidationError("invalid", "Ledger metadata fields are not permitted.");
    }
  }
  return sha(JSON.stringify(meta, Object.keys(meta).sort()));
}

function entryHash(row: {
  id: string;
  organizationId: string;
  facilityId: string | null;
  actorId: string;
  subjectId: string | null;
  action: string;
  resourceType: string;
  resourceId: string | null;
  purpose: string;
  outcome: string;
  correlationId: string;
  beforeHash: string;
  afterHash: string;
  previousHash: string;
  createdAt: string;
}) {
  return sha(
    [
      row.previousHash,
      row.id,
      row.organizationId,
      row.facilityId ?? "",
      row.actorId,
      row.subjectId ?? "",
      row.action,
      row.resourceType,
      row.resourceId ?? "",
      row.purpose,
      row.outcome,
      row.correlationId,
      row.beforeHash,
      row.afterHash,
      row.createdAt,
    ].join("|"),
  );
}

export function appendAccessLedger(
  db: AppDatabase,
  input: {
    organizationId: string;
    facilityId: string | null;
    actorId: string;
    subjectId: string | null;
    action: string;
    resourceType: string;
    resourceId: string | null;
    purpose: string;
    outcome: string;
    correlationId: string;
    before: LedgerMeta | null;
    after: LedgerMeta | null;
  },
) {
  if (input.subjectId && /\s/.test(input.subjectId)) {
    throw new ValidationError("invalid", "The ledger stores an identifier, not a name.");
  }
  const inspected = JSON.stringify({
    subjectId: input.subjectId,
    action: input.action,
    resourceId: input.resourceId,
    correlationId: input.correlationId,
    before: input.before,
    after: input.after,
  });
  if (/bearer\s+\S+|syn-canary-|@[^\s]+\.invalid|\b\d{3}-\d{3}-\d{4}\b|cura_session=|synthetic-bulk-/i.test(inspected)) {
    throw new ValidationError("invalid", "That ledger value is not allowed.");
  }
  const previous = get<{ entry_hash: string }>(
    db,
    `SELECT entry_hash FROM access_ledger WHERE organization_id = ? ORDER BY sequence DESC LIMIT 1`,
    input.organizationId,
  );
  const row = {
    id: randomUUID(),
    organizationId: input.organizationId,
    facilityId: input.facilityId,
    actorId: input.actorId,
    subjectId: input.subjectId,
    action: input.action,
    resourceType: input.resourceType,
    resourceId: input.resourceId,
    purpose: input.purpose,
    outcome: input.outcome,
    correlationId: input.correlationId,
    beforeHash: metadataHash(input.before),
    afterHash: metadataHash(input.after),
    previousHash: previous?.entry_hash ?? GENESIS,
    createdAt: new Date().toISOString(),
  };
  const hash = entryHash(row);
  run(
    db,
    `INSERT INTO access_ledger (
      id, organization_id, facility_id, actor_id, subject_id, action, resource_type, resource_id, purpose, outcome,
      correlation_id, before_hash, after_hash, previous_hash, entry_hash, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    row.id,
    row.organizationId,
    row.facilityId,
    row.actorId,
    row.subjectId,
    row.action,
    row.resourceType,
    row.resourceId,
    row.purpose,
    row.outcome,
    row.correlationId,
    row.beforeHash,
    row.afterHash,
    row.previousHash,
    hash,
    row.createdAt,
  );
  return { ...row, entryHash: hash };
}

export function verifyAccessLedger(db: AppDatabase, organizationId: string) {
  const rows = all<{
    sequence: number;
    id: string;
    organization_id: string;
    facility_id: string | null;
    actor_id: string;
    subject_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    purpose: string;
    outcome: string;
    correlation_id: string;
    before_hash: string;
    after_hash: string;
    previous_hash: string;
    entry_hash: string;
    created_at: string;
  }>(db, `SELECT * FROM access_ledger WHERE organization_id = ? ORDER BY sequence`, organizationId);
  let previous = GENESIS;
  for (const row of rows) {
    const mapped = {
      id: row.id,
      organizationId: row.organization_id,
      facilityId: row.facility_id,
      actorId: row.actor_id,
      subjectId: row.subject_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      purpose: row.purpose,
      outcome: row.outcome,
      correlationId: row.correlation_id,
      beforeHash: row.before_hash,
      afterHash: row.after_hash,
      previousHash: row.previous_hash,
      createdAt: row.created_at,
    };
    if (row.previous_hash !== previous || entryHash(mapped) !== row.entry_hash) {
      return { intact: false, sequence: row.sequence };
    }
    previous = row.entry_hash;
  }
  return { intact: true, sequence: null };
}

export function listAccessLedger(
  db: AppDatabase,
  actor: { userId: string; organizationId: string; facilityId: string | null },
): { intact: boolean; brokenAt: number | null; entries: LedgerEntry[] } {
  const access = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId);
  if (!access.permissions.includes("security.audit.read")) throw new ForbiddenError();
  const verification = verifyAccessLedger(db, actor.organizationId);
  const rows = all<{
    sequence: number;
    id: string;
    organization_id: string;
    facility_id: string | null;
    actor_id: string;
    subject_id: string | null;
    action: string;
    resource_type: string;
    resource_id: string | null;
    purpose: string;
    outcome: string;
    correlation_id: string;
    before_hash: string;
    after_hash: string;
    previous_hash: string;
    entry_hash: string;
    created_at: string;
  }>(
    db,
    `SELECT * FROM access_ledger WHERE organization_id = ? ORDER BY sequence DESC LIMIT 200`,
    actor.organizationId,
  );
  return {
    intact: verification.intact,
    brokenAt: verification.sequence,
    entries: rows.map((row) => ({
      sequence: row.sequence,
      id: row.id,
      organizationId: row.organization_id,
      facilityId: row.facility_id,
      actorId: row.actor_id,
      subjectId: row.subject_id,
      action: row.action,
      resourceType: row.resource_type,
      resourceId: row.resource_id,
      purpose: row.purpose,
      outcome: row.outcome,
      correlationId: row.correlation_id,
      beforeHash: row.before_hash,
      afterHash: row.after_hash,
      previousHash: row.previous_hash,
      entryHash: row.entry_hash,
      createdAt: row.created_at,
    })),
  };
}
