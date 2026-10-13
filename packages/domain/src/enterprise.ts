import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { healthcheck } from "./chart";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";

export const ENTERPRISE_REGION = "local-sqlite";
export const ENTERPRISE_REGION_VERSION = "residency-2026.10";
export const ENTERPRISE_RESIDENCY_NOTE = "Records stay in local-sqlite. A second region is not connected.";
export const ENTERPRISE_UNPINNED_NOTE = "No residency pin is stored. A region is not assumed.";
export const ENTERPRISE_RPO_NOTE = "No replica is stored. A recovery point is not calculated.";
export const ENTERPRISE_RTO_NOTE = "No second region is connected. A failover time is not calculated.";
export const ENTERPRISE_DRILL_NOTE = "The local database answered. A regional failover was not run.";
export const ENTERPRISE_SSO_NOTE = "No identity provider is connected. SCIM is not provisioning accounts.";
export const ENTERPRISE_KEY_NOTE = "No customer key is stored. Records are not encrypted with a tenant key.";
export const ENTERPRISE_LINK_NOTE = "No private network is connected.";
export const ENTERPRISE_API_NOTE = "No external credential was issued. Calls use the directory session.";
export const ENTERPRISE_MOVE_NOTE = "A tenant is not moved. No second region is connected.";
export const ENTERPRISE_AI_NOTE = "No region was changed. Enterprise text is not written by a model.";

export type EnterpriseView = {
  regionVersion: string;
  region: typeof ENTERPRISE_REGION | null;
  residencyNote: string;
  rpoNote: string;
  rtoNote: string;
  ssoNote: string;
  keyNote: string;
  linkNote: string;
  apiNote: string;
  moveNote: string;
  aiNote: string;
  federation: { status: "not-connected" } | null;
  key: { status: "not-configured" } | null;
  drills: { id: string; elapsedMs: number; schemaVersion: number; failover: "not-run"; note: string; createdAt: string }[];
  grants: { id: string; label: string; scope: "health.read"; status: "local-session" }[];
};

export function holdEnterpriseText(text: string, _aiOutput: unknown) {
  return text;
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function assertAdmin(db: AppDatabase, ctx: SessionContext) {
  if (ctx.role !== "admin" || ctx.purposeOfUse !== "OPERATIONS") {
    writeAudit(db, ctx, { action: "enterprise.read", resourceType: "EnterpriseResidency", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
}

function labelOf(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 40) throw new ValidationError();
  if (/\d{13,19}/.test(trimmed.replace(/[\s-]/g, ""))) throw new ValidationError();
  return trimmed;
}

function replay<T>(db: AppDatabase, ctx: SessionContext, key: string, hash: string): T | undefined {
  const row = get<{ request_hash: string; response_json: string }>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    ctx.organizationId,
    key,
  );
  if (!row) return undefined;
  if (row.request_hash !== hash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  return JSON.parse(row.response_json) as T;
}

function saveKey(db: AppDatabase, ctx: SessionContext, key: string, hash: string, body: unknown, now: string) {
  execute(
    db,
    `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ctx.organizationId,
    key,
    ctx.userId,
    hash,
    JSON.stringify(body),
    now,
  );
}

function publish(db: AppDatabase, ctx: SessionContext, eventType: string, payload: Record<string, string | number>, now: string) {
  execute(
    db,
    `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    ctx.organizationId,
    eventType,
    JSON.stringify(payload),
    now,
  );
}

export function readEnterprise(db: AppDatabase, ctx: SessionContext): EnterpriseView {
  assertAdmin(db, ctx);
  writeAudit(db, ctx, { action: "enterprise.read", resourceType: "EnterpriseResidency", resourceId: ctx.organizationId, outcome: "success" });
  const residency = get<{ region: typeof ENTERPRISE_REGION }>(
    db,
    `SELECT region FROM enterprise_residency WHERE organization_id = ?`,
    ctx.organizationId,
  );
  const federation = get<{ status: "not-connected" }>(db, `SELECT status FROM enterprise_federation WHERE organization_id = ?`, ctx.organizationId);
  const key = get<{ status: "not-configured" }>(db, `SELECT status FROM enterprise_keys WHERE organization_id = ?`, ctx.organizationId);
  const drills = all<{ id: string; elapsed_ms: number; schema_version: number; created_at: string }>(
    db,
    `SELECT id, elapsed_ms, schema_version, created_at FROM enterprise_drills WHERE organization_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
  );
  const grants = all<{ id: string; label: string }>(
    db,
    `SELECT id, label FROM enterprise_grants WHERE organization_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
  );
  return {
    regionVersion: ENTERPRISE_REGION_VERSION,
    region: residency?.region ?? null,
    residencyNote: residency ? ENTERPRISE_RESIDENCY_NOTE : ENTERPRISE_UNPINNED_NOTE,
    rpoNote: ENTERPRISE_RPO_NOTE,
    rtoNote: ENTERPRISE_RTO_NOTE,
    ssoNote: ENTERPRISE_SSO_NOTE,
    keyNote: ENTERPRISE_KEY_NOTE,
    linkNote: ENTERPRISE_LINK_NOTE,
    apiNote: ENTERPRISE_API_NOTE,
    moveNote: ENTERPRISE_MOVE_NOTE,
    aiNote: holdEnterpriseText(ENTERPRISE_AI_NOTE, null),
    federation: federation ? { status: "not-connected" } : null,
    key: key ? { status: "not-configured" } : null,
    drills: drills.map((row) => ({
      id: row.id,
      elapsedMs: Number(row.elapsed_ms),
      schemaVersion: Number(row.schema_version),
      failover: "not-run",
      note: ENTERPRISE_DRILL_NOTE,
      createdAt: row.created_at,
    })),
    grants: grants.map((row) => ({ id: row.id, label: row.label, scope: "health.read" as const, status: "local-session" as const })),
  };
}

export function recordResidency(db: AppDatabase, ctx: SessionContext, input: { region: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  if (input.region !== ENTERPRISE_REGION) throw new ValidationError("code", "That region is not connected.");
  const hash = canonicalHash({ region: ENTERPRISE_REGION });
  const prior = replay<{ region: typeof ENTERPRISE_REGION }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const now = new Date().toISOString();
  const saved = { region: ENTERPRISE_REGION };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO enterprise_residency (organization_id, region, author_id, updated_at) VALUES (?, 'local-sqlite', ?, ?)
       ON CONFLICT(organization_id) DO UPDATE SET region = 'local-sqlite', author_id = excluded.author_id, updated_at = excluded.updated_at`,
      ctx.organizationId,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "enterprise.residency", { region: ENTERPRISE_REGION }, now);
    writeAudit(db, ctx, { action: "enterprise.residency", resourceType: "EnterpriseResidency", resourceId: ctx.organizationId, outcome: "success" });
  });
  return saved;
}

export function recordFederation(db: AppDatabase, ctx: SessionContext, input: { endpoint?: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  if (input.endpoint && input.endpoint.trim().length > 0) throw new ValidationError("invalid", "No identity provider is connected.");
  const hash = canonicalHash({ status: "not-connected" });
  const prior = replay<{ status: "not-connected" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const now = new Date().toISOString();
  const saved = { status: "not-connected" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO enterprise_federation (organization_id, status, author_id, updated_at) VALUES (?, 'not-connected', ?, ?)
       ON CONFLICT(organization_id) DO UPDATE SET status = 'not-connected', author_id = excluded.author_id, updated_at = excluded.updated_at`,
      ctx.organizationId,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "enterprise.federation", { status: "not-connected" }, now);
    writeAudit(db, ctx, { action: "enterprise.federation", resourceType: "EnterpriseFederation", resourceId: ctx.organizationId, outcome: "success" });
  });
  return saved;
}

export function recordKeyStatus(db: AppDatabase, ctx: SessionContext, input: { material?: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  if (input.material && input.material.trim().length > 0) throw new ValidationError("invalid", "No customer key is stored.");
  const hash = canonicalHash({ status: "not-configured" });
  const prior = replay<{ status: "not-configured" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const now = new Date().toISOString();
  const saved = { status: "not-configured" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO enterprise_keys (organization_id, status, author_id, updated_at) VALUES (?, 'not-configured', ?, ?)
       ON CONFLICT(organization_id) DO UPDATE SET status = 'not-configured', author_id = excluded.author_id, updated_at = excluded.updated_at`,
      ctx.organizationId,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "enterprise.key", { status: "not-configured" }, now);
    writeAudit(db, ctx, { action: "enterprise.key", resourceType: "EnterpriseKey", resourceId: ctx.organizationId, outcome: "success" });
  });
  return saved;
}

export function recordRegionDrill(db: AppDatabase, ctx: SessionContext, input: { idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  const hash = canonicalHash({ failover: "not-run" });
  const prior = replay<{ drillId: string; failover: "not-run"; schemaVersion: number; elapsedMs: number }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const started = Date.now();
  const health = healthcheck(db);
  const elapsedMs = Date.now() - started;
  const drillId = `edr_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { drillId, failover: "not-run" as const, schemaVersion: health.schemaVersion, elapsedMs };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO enterprise_drills (id, organization_id, elapsed_ms, schema_version, failover, author_id, created_at)
       VALUES (?, ?, ?, ?, 'not-run', ?, ?)`,
      drillId,
      ctx.organizationId,
      elapsedMs,
      health.schemaVersion,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "enterprise.drill", { drillId, failover: "not-run" }, now);
    writeAudit(db, ctx, { action: "enterprise.drill", resourceType: "EnterpriseDrill", resourceId: drillId, outcome: "success" });
  });
  return saved;
}

export function recordApiGrant(db: AppDatabase, ctx: SessionContext, input: { label: string; scope?: string; audience?: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  if (input.scope && input.scope !== "health.read") throw new ValidationError("code", "That API scope is not in the pin.");
  if (input.audience && input.audience.trim().length > 0) throw new ValidationError("invalid", "No external credential was issued.");
  const label = labelOf(input.label);
  const hash = canonicalHash({ label, scope: "health.read" });
  const prior = replay<{ grantId: string; status: "local-session" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const grantId = `egr_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { grantId, status: "local-session" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO enterprise_grants (id, organization_id, label, scope, status, author_id, created_at)
       VALUES (?, ?, ?, 'health.read', 'local-session', ?, ?)`,
      grantId,
      ctx.organizationId,
      label,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "enterprise.grant", { grantId }, now);
    writeAudit(db, ctx, { action: "enterprise.grant", resourceType: "EnterpriseGrant", resourceId: grantId, outcome: "success" });
  });
  return saved;
}

export function moveTenant(db: AppDatabase, ctx: SessionContext, input: { targetRegion: string; idempotencyKey: string }): never {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  writeAudit(db, ctx, { action: "enterprise.move", resourceType: "EnterpriseResidency", resourceId: ctx.organizationId, outcome: "denied" });
  throw new ValidationError("invalid", ENTERPRISE_MOVE_NOTE);
}

export function explainEnterprise(db: AppDatabase, ctx: SessionContext, input: { idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  const before = get<{ region: string }>(db, `SELECT region FROM enterprise_residency WHERE organization_id = ?`, ctx.organizationId);
  const gateway = invokeGateway(
    db,
    ctx,
    {
      promptId: GATEWAY_PROMPT.id,
      promptVersion: GATEWAY_PROMPT.version,
      text: "Choose a cloud region for this tenant.",
      idempotencyKey: input.idempotencyKey,
    },
    adapter,
  );
  const after = get<{ region: string }>(db, `SELECT region FROM enterprise_residency WHERE organization_id = ?`, ctx.organizationId);
  writeAudit(db, ctx, { action: "enterprise.explain", resourceType: "EnterpriseResidency", resourceId: ctx.organizationId, outcome: "success" });
  return {
    text: holdEnterpriseText(ENTERPRISE_AI_NOTE, gateway.output),
    aiOutcome: gateway.outcome,
    aiText: null,
    unchanged: before?.region === after?.region,
  };
}
