import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { containsDirectIdentifier } from "./analytics";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_MODEL, GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";

export const RELEASE_STRATEGY_VERSION = "release-strategy-2026.10";
export const RELEASE_BYTE_LIMIT = 1024;
export const RELEASE_TRACE_DOCS = ["ADR-0022", "RFC-0023", "R28"] as const;
export const RELEASE_STRATEGY_NOTE = "No regulatory authority is connected. This label is not an approval.";
export const RELEASE_DOSSIER_NOTE = "This module stores a refusal gate. It does not diagnose or recommend treatment.";
export const RELEASE_TRACE_NOTE = "The trace lists local document ids. No quality certificate is stored.";
export const RELEASE_RISK_NOTE = "No risk-management file is signed. This is not a clearance.";
export const RELEASE_VV_NOTE = "The gateway refused the clinical prompt. This is not a validation of benefit.";
export const RELEASE_CLINICAL_NOTE = "No clinical evaluation is stored. This is not evidence of benefit.";
export const RELEASE_CHANGE_NOTE = "No change plan is authorized. A model is not updated.";
export const RELEASE_SURVEILLANCE_NOTE = "No performance monitor is connected. A real-world rate is not calculated.";
export const RELEASE_ATTEMPT_NOTE = "The quality gates were recorded. The module is not released.";
export const RELEASE_AI_NOTE = "No module was released. Release text is not written by a model.";

export type ReleaseTrainView = {
  strategyVersion: string;
  strategyNote: string;
  dossierNote: string;
  traceNote: string;
  traceDocs: readonly string[];
  riskNote: string;
  validationNote: string;
  clinicalNote: string;
  changeNote: string;
  surveillanceNote: string;
  attemptNote: string;
  aiNote: string;
  strategies: { id: string; jurisdiction: "local-synthetic"; status: "not-approved" }[];
  dossiers: {
    id: string;
    strategyId: string;
    label: string;
    authorId: string;
    trace: boolean;
    risk: "not-reviewed" | null;
    validation: "refused" | null;
    clinical: "not-performed" | null;
    change: "not-authorized" | null;
    surveillance: { status: "not-active"; refusalCount: number } | null;
  }[];
  attempts: { id: string; dossierId: string; outcome: "not-released" }[];
};

export function holdReleaseText(text: string, _aiOutput: unknown) {
  return text;
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function assertClaim(claim: string | undefined) {
  if ((claim ?? "").length > RELEASE_BYTE_LIMIT) throw new ValidationError("range", "A clinical claim is not stored.");
}

function assertAuditor(db: AppDatabase, ctx: SessionContext) {
  if (ctx.role !== "auditor" || ctx.purposeOfUse !== "AUDIT") {
    writeAudit(db, ctx, { action: "release.read", resourceType: "ReleaseDossier", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
}

function labelOf(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 40) throw new ValidationError();
  if (/\d{13,19}/.test(trimmed.replace(/[\s-]/g, ""))) throw new ValidationError();
  return trimmed;
}

function filled(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function gateKey(userKey: string) {
  return `${userKey.slice(0, 70)}-gate`.slice(0, 80);
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

function strategyOf(db: AppDatabase, ctx: SessionContext, strategyId: string) {
  const row = get<{ id: string }>(db, `SELECT id FROM release_strategies WHERE id = ? AND organization_id = ?`, strategyId, ctx.organizationId);
  if (!row) throw new NotFoundError();
  return row;
}

function dossierOf(db: AppDatabase, ctx: SessionContext, dossierId: string) {
  const row = get<{ id: string; author_id: string; strategy_id: string }>(
    db,
    `SELECT id, author_id, strategy_id FROM release_dossiers WHERE id = ? AND organization_id = ?`,
    dossierId,
    ctx.organizationId,
  );
  if (!row) throw new NotFoundError();
  return row;
}

function gateRow(db: AppDatabase) {
  const row = get<{ id: string; version: string; status: string }>(
    db,
    `SELECT id, version, status FROM gateway_models WHERE id = ? AND version = ?`,
    GATEWAY_MODEL.id,
    GATEWAY_MODEL.version,
  );
  if (!row) throw new NotFoundError("The refusal gate is not stored.");
  return row;
}

function refusalCount(db: AppDatabase, organizationId: string) {
  const row = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM gateway_attempts WHERE organization_id = ? AND outcome = 'refused'`, organizationId);
  return Number(row?.c ?? 0);
}

export function readReleaseTrain(db: AppDatabase, ctx: SessionContext): ReleaseTrainView {
  assertAuditor(db, ctx);
  writeAudit(db, ctx, { action: "release.read", resourceType: "ReleaseDossier", resourceId: ctx.organizationId, outcome: "success" });
  const strategies = all<{ id: string }>(db, `SELECT id FROM release_strategies WHERE organization_id = ? ORDER BY created_at, id`, ctx.organizationId);
  const dossiers = all<{ id: string; strategy_id: string; label: string; author_id: string }>(
    db,
    `SELECT id, strategy_id, label, author_id FROM release_dossiers WHERE organization_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
  );
  const traces = new Set(all<{ dossier_id: string }>(db, `SELECT dossier_id FROM release_traces WHERE organization_id = ?`, ctx.organizationId).map((row) => row.dossier_id));
  const risks = new Set(all<{ dossier_id: string }>(db, `SELECT dossier_id FROM release_risks WHERE organization_id = ?`, ctx.organizationId).map((row) => row.dossier_id));
  const validations = new Set(all<{ dossier_id: string }>(db, `SELECT dossier_id FROM release_validations WHERE organization_id = ?`, ctx.organizationId).map((row) => row.dossier_id));
  const clinical = new Set(all<{ dossier_id: string }>(db, `SELECT dossier_id FROM release_evaluations WHERE organization_id = ?`, ctx.organizationId).map((row) => row.dossier_id));
  const changes = new Set(all<{ dossier_id: string }>(db, `SELECT dossier_id FROM release_changes WHERE organization_id = ?`, ctx.organizationId).map((row) => row.dossier_id));
  const surveillance = new Map(
    all<{ dossier_id: string; refusal_count: number }>(db, `SELECT dossier_id, refusal_count FROM release_surveillance WHERE organization_id = ?`, ctx.organizationId).map((row) => [row.dossier_id, Number(row.refusal_count)]),
  );
  const attempts = all<{ id: string; dossier_id: string }>(db, `SELECT id, dossier_id FROM release_attempts WHERE organization_id = ? ORDER BY created_at, id`, ctx.organizationId);
  return {
    strategyVersion: RELEASE_STRATEGY_VERSION,
    strategyNote: RELEASE_STRATEGY_NOTE,
    dossierNote: RELEASE_DOSSIER_NOTE,
    traceNote: RELEASE_TRACE_NOTE,
    traceDocs: RELEASE_TRACE_DOCS,
    riskNote: RELEASE_RISK_NOTE,
    validationNote: RELEASE_VV_NOTE,
    clinicalNote: RELEASE_CLINICAL_NOTE,
    changeNote: RELEASE_CHANGE_NOTE,
    surveillanceNote: RELEASE_SURVEILLANCE_NOTE,
    attemptNote: RELEASE_ATTEMPT_NOTE,
    aiNote: holdReleaseText(RELEASE_AI_NOTE, null),
    strategies: strategies.map((row) => ({ id: row.id, jurisdiction: "local-synthetic" as const, status: "not-approved" as const })),
    dossiers: dossiers.map((row) => ({
      id: row.id,
      strategyId: row.strategy_id,
      label: row.label,
      authorId: row.author_id,
      trace: traces.has(row.id),
      risk: risks.has(row.id) ? ("not-reviewed" as const) : null,
      validation: validations.has(row.id) ? ("refused" as const) : null,
      clinical: clinical.has(row.id) ? ("not-performed" as const) : null,
      change: changes.has(row.id) ? ("not-authorized" as const) : null,
      surveillance: surveillance.has(row.id) ? { status: "not-active" as const, refusalCount: surveillance.get(row.id) ?? 0 } : null,
    })),
    attempts: attempts.map((row) => ({ id: row.id, dossierId: row.dossier_id, outcome: "not-released" as const })),
  };
}

export function recordStrategy(db: AppDatabase, ctx: SessionContext, input: { jurisdiction?: string; status?: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  if (input.jurisdiction !== "local-synthetic") throw new ValidationError("code", "That jurisdiction is not in the pin.");
  if (input.status && input.status !== "not-approved") throw new ValidationError("code", "A strategy is not stored as an approval.");
  const hash = canonicalHash({ jurisdiction: "local-synthetic", status: "not-approved" });
  const prior = replay<{ strategyId: string; status: "not-approved" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const strategyId = `rst_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { strategyId, status: "not-approved" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO release_strategies (id, organization_id, jurisdiction, status, author_id, created_at) VALUES (?, ?, 'local-synthetic', 'not-approved', ?, ?)`,
      strategyId,
      ctx.organizationId,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "release.strategy", { strategyId, status: "not-approved" }, now);
    writeAudit(db, ctx, { action: "release.strategy", resourceType: "ReleaseStrategy", resourceId: strategyId, outcome: "success" });
  });
  return saved;
}

export function recordDossier(
  db: AppDatabase,
  ctx: SessionContext,
  input: { strategyId: string; label: string; claim?: string; idempotencyKey: string },
) {
  assertClaim(input.claim);
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  if (filled(input.claim)) throw new ValidationError("invalid", "A clinical claim is not stored.");
  const strategy = strategyOf(db, ctx, input.strategyId);
  const label = labelOf(input.label);
  if (containsDirectIdentifier(db, ctx.organizationId, label)) throw new ValidationError("invalid", "That label matches a stored identifier.");
  const hash = canonicalHash({ strategyId: strategy.id, label });
  const prior = replay<{ dossierId: string }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const dossierId = `dos_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { dossierId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO release_dossiers (id, organization_id, strategy_id, label, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      dossierId,
      ctx.organizationId,
      strategy.id,
      label,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "release.dossier", { dossierId, strategyId: strategy.id }, now);
    writeAudit(db, ctx, { action: "release.dossier", resourceType: "ReleaseDossier", resourceId: dossierId, outcome: "success" });
  });
  return saved;
}

function recordGate(
  db: AppDatabase,
  ctx: SessionContext,
  input: { dossierId: string; idempotencyKey: string },
  gate: { table: string; idPrefix: string; event: string; action: string; resource: string; hash: Record<string, string>; columns: string; valuesSql: string; params: (id: string, now: string, dossierId: string) => Array<string | number> },
) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  const dossier = dossierOf(db, ctx, input.dossierId);
  const hash = canonicalHash({ dossierId: dossier.id, ...gate.hash });
  const prior = replay<{ id: string }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const existing = get<{ id: string }>(db, `SELECT id FROM ${gate.table} WHERE dossier_id = ? AND organization_id = ?`, dossier.id, ctx.organizationId);
  if (existing) throw new ConflictError("conflict", "That gate is already stored.");
  const id = `${gate.idPrefix}_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { id };
  transaction(db, () => {
    execute(db, `INSERT INTO ${gate.table} (id, organization_id, dossier_id, ${gate.columns}) VALUES (?, ?, ?, ${gate.valuesSql})`, ...gate.params(id, now, dossier.id));
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, gate.event, { id, dossierId: dossier.id }, now);
    writeAudit(db, ctx, { action: gate.action, resourceType: gate.resource, resourceId: id, outcome: "success" });
  });
  return saved;
}

export function recordTrace(db: AppDatabase, ctx: SessionContext, input: { dossierId: string; certificate?: string; idempotencyKey: string }) {
  if (filled(input.certificate)) throw new ValidationError("invalid", RELEASE_TRACE_NOTE);
  const saved = recordGate(db, ctx, input, {
    table: "release_traces",
    idPrefix: "rtr",
    event: "release.trace",
    action: "release.trace",
    resource: "ReleaseTrace",
    hash: { trace: "local" },
    columns: "author_id, created_at",
    valuesSql: "?, ?",
    params: (id, now, dossierId) => [id, ctx.organizationId, dossierId, ctx.userId, now],
  });
  return { traceId: saved.id };
}

export function recordRiskFile(db: AppDatabase, ctx: SessionContext, input: { dossierId: string; signed?: string; idempotencyKey: string }) {
  if (input.signed && input.signed !== "not-reviewed") throw new ValidationError("code", RELEASE_RISK_NOTE);
  const saved = recordGate(db, ctx, input, {
    table: "release_risks",
    idPrefix: "rmf",
    event: "release.risk",
    action: "release.risk",
    resource: "ReleaseRisk",
    hash: { status: "not-reviewed" },
    columns: "status, author_id, created_at",
    valuesSql: "'not-reviewed', ?, ?",
    params: (id, now, dossierId) => [id, ctx.organizationId, dossierId, ctx.userId, now],
  });
  return { riskId: saved.id, status: "not-reviewed" as const };
}

export function recordValidation(db: AppDatabase, ctx: SessionContext, input: { dossierId: string; idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  const dossier = dossierOf(db, ctx, input.dossierId);
  const hash = canonicalHash({ dossierId: dossier.id, outcome: "refused" });
  const prior = replay<{ validationId: string; outcome: "refused" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const existing = get<{ id: string }>(db, `SELECT id FROM release_validations WHERE dossier_id = ? AND organization_id = ?`, dossier.id, ctx.organizationId);
  if (existing) throw new ConflictError("conflict", "That gate is already stored.");
  const gateway = invokeGateway(
    db,
    ctx,
    { promptId: GATEWAY_PROMPT.id, promptVersion: GATEWAY_PROMPT.version, text: "Validate this module for diagnosis.", idempotencyKey: gateKey(input.idempotencyKey) },
    adapter,
  );
  if (gateway.outcome !== "refused") throw new ConflictError("conflict", "A validation is stored only when the gateway refuses.");
  const validationId = `rvv_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { validationId, outcome: "refused" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO release_validations (id, organization_id, dossier_id, outcome, author_id, created_at) VALUES (?, ?, ?, 'refused', ?, ?)`,
      validationId,
      ctx.organizationId,
      dossier.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "release.validation", { validationId, dossierId: dossier.id, outcome: "refused" }, now);
    writeAudit(db, ctx, { action: "release.validation", resourceType: "ReleaseValidation", resourceId: validationId, outcome: "success" });
  });
  return saved;
}

export function recordClinicalEvaluation(db: AppDatabase, ctx: SessionContext, input: { dossierId: string; result?: string; idempotencyKey: string }) {
  if (filled(input.result)) throw new ValidationError("invalid", RELEASE_CLINICAL_NOTE);
  const saved = recordGate(db, ctx, input, {
    table: "release_evaluations",
    idPrefix: "rce",
    event: "release.evaluation",
    action: "release.evaluation",
    resource: "ReleaseEvaluation",
    hash: { status: "not-performed" },
    columns: "status, author_id, created_at",
    valuesSql: "'not-performed', ?, ?",
    params: (id, now, dossierId) => [id, ctx.organizationId, dossierId, ctx.userId, now],
  });
  return { evaluationId: saved.id, status: "not-performed" as const };
}

export function recordChangePlan(db: AppDatabase, ctx: SessionContext, input: { dossierId: string; modelId?: string; modelVersion?: string; idempotencyKey: string }) {
  if ((input.modelId && input.modelId !== GATEWAY_MODEL.id) || (input.modelVersion && input.modelVersion !== GATEWAY_MODEL.version)) {
    throw new ValidationError("code", RELEASE_CHANGE_NOTE);
  }
  const saved = recordGate(db, ctx, input, {
    table: "release_changes",
    idPrefix: "rpc",
    event: "release.change",
    action: "release.change",
    resource: "ReleaseChange",
    hash: { status: "not-authorized" },
    columns: "status, author_id, created_at",
    valuesSql: "'not-authorized', ?, ?",
    params: (id, now, dossierId) => [id, ctx.organizationId, dossierId, ctx.userId, now],
  });
  return { changeId: saved.id, status: "not-authorized" as const };
}

export function recordSurveillance(db: AppDatabase, ctx: SessionContext, input: { dossierId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  const dossier = dossierOf(db, ctx, input.dossierId);
  const count = refusalCount(db, ctx.organizationId);
  const hash = canonicalHash({ dossierId: dossier.id, status: "not-active", refusalCount: count });
  const prior = replay<{ surveillanceId: string; status: "not-active"; refusalCount: number }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const existing = get<{ id: string }>(db, `SELECT id FROM release_surveillance WHERE dossier_id = ? AND organization_id = ?`, dossier.id, ctx.organizationId);
  if (existing) throw new ConflictError("conflict", "That gate is already stored.");
  const surveillanceId = `rpm_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { surveillanceId, status: "not-active" as const, refusalCount: count };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO release_surveillance (id, organization_id, dossier_id, status, refusal_count, author_id, created_at) VALUES (?, ?, ?, 'not-active', ?, ?, ?)`,
      surveillanceId,
      ctx.organizationId,
      dossier.id,
      count,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "release.surveillance", { surveillanceId, dossierId: dossier.id, status: "not-active" }, now);
    writeAudit(db, ctx, { action: "release.surveillance", resourceType: "ReleaseSurveillance", resourceId: surveillanceId, outcome: "success" });
  });
  return saved;
}

function gatesReady(db: AppDatabase, ctx: SessionContext, dossierId: string) {
  const ready = get<{ id: string }>(
    db,
    `SELECT d.id FROM release_dossiers d
     JOIN release_strategies s ON s.id = d.strategy_id AND s.organization_id = d.organization_id AND s.status = 'not-approved'
     JOIN release_traces t ON t.dossier_id = d.id AND t.organization_id = d.organization_id
     JOIN release_risks r ON r.dossier_id = d.id AND r.organization_id = d.organization_id AND r.status = 'not-reviewed'
     JOIN release_validations v ON v.dossier_id = d.id AND v.organization_id = d.organization_id AND v.outcome = 'refused'
     JOIN release_evaluations e ON e.dossier_id = d.id AND e.organization_id = d.organization_id AND e.status = 'not-performed'
     JOIN release_changes c ON c.dossier_id = d.id AND c.organization_id = d.organization_id AND c.status = 'not-authorized'
     JOIN release_surveillance u ON u.dossier_id = d.id AND u.organization_id = d.organization_id AND u.status = 'not-active'
     WHERE d.id = ? AND d.organization_id = ?`,
    dossierId,
    ctx.organizationId,
  );
  return Boolean(ready);
}

export function recordReleaseAttempt(db: AppDatabase, ctx: SessionContext, input: { dossierId: string; decision?: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  if (input.decision && input.decision !== "not-released") throw new ValidationError("code", "A release is not stored as an approval.");
  const dossier = dossierOf(db, ctx, input.dossierId);
  if (dossier.author_id === ctx.userId) throw new ForbiddenError();
  if (!gatesReady(db, ctx, dossier.id)) {
    writeAudit(db, ctx, { action: "release.attempt", resourceType: "ReleaseAttempt", resourceId: dossier.id, outcome: "denied" });
    throw new ValidationError("invalid", "A release cannot skip a quality gate.");
  }
  const hash = canonicalHash({ dossierId: dossier.id, outcome: "not-released" });
  const prior = replay<{ attemptId: string; outcome: "not-released" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const before = gateRow(db);
  const attemptId = `rra_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { attemptId, outcome: "not-released" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO release_attempts (id, organization_id, dossier_id, outcome, author_id, created_at) VALUES (?, ?, ?, 'not-released', ?, ?)`,
      attemptId,
      ctx.organizationId,
      dossier.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "release.attempt", { attemptId, dossierId: dossier.id, outcome: "not-released" }, now);
    writeAudit(db, ctx, { action: "release.attempt", resourceType: "ReleaseAttempt", resourceId: attemptId, outcome: "success" });
  });
  const after = gateRow(db);
  if (after.status !== "disabled" || after.status !== before.status || after.id !== before.id) {
    throw new ConflictError("conflict", "The refusal gate changed during the release attempt.");
  }
  return saved;
}

export function explainReleaseTrain(db: AppDatabase, ctx: SessionContext, input: { idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  const before = all<{ id: string; outcome: string }>(db, `SELECT id, outcome FROM release_attempts WHERE organization_id = ? ORDER BY id`, ctx.organizationId);
  const gateway = invokeGateway(
    db,
    ctx,
    { promptId: GATEWAY_PROMPT.id, promptVersion: GATEWAY_PROMPT.version, text: "Approve this module for diagnosis.", idempotencyKey: input.idempotencyKey },
    adapter,
  );
  const after = all<{ id: string; outcome: string }>(db, `SELECT id, outcome FROM release_attempts WHERE organization_id = ? ORDER BY id`, ctx.organizationId);
  writeAudit(db, ctx, { action: "release.explain", resourceType: "ReleaseDossier", resourceId: ctx.organizationId, outcome: "success" });
  return {
    text: holdReleaseText(RELEASE_AI_NOTE, gateway.output),
    aiOutcome: gateway.outcome,
    aiText: null,
    unchanged: JSON.stringify(before) === JSON.stringify(after),
  };
}
