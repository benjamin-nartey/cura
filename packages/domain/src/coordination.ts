import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { noteDenial, writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { getChart } from "./chart";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";
import { buildPatientState } from "./patient-state";
import { canReadChart, canRegisterPatient } from "./session";

export const OUTREACH_VERSION = "outreach-templates-2026.10";

const TEMPLATES = [
  { id: "tpl_followup", locale: "en", body: "A follow-up is stored on your facility record." },
  { id: "tpl_followup", locale: "es", body: "Hay un seguimiento guardado en el registro de su centro." },
  { id: "tpl_gap", locale: "en", body: "A stored result or visit is still open on your facility record." },
  { id: "tpl_gap", locale: "es", body: "Hay un resultado o una visita guardada todavía abierta en el registro de su centro." },
  { id: "tpl_record_en", locale: "en", body: "This note is stored in English only." },
] as const;

export type OutreachFailure = "consent" | "channel" | "locale";

export function holdOutreachBody(body: string, _aiOutput: unknown) {
  return body;
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function facilityOf(ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx)) throw new ForbiddenError();
  return ctx.facilityId;
}

function clip(value: string, max: number) {
  const text = value.trim();
  if (text.length < 1 || text.length > max || /[\r\n]/.test(text)) throw new ValidationError();
  return text;
}

export function seedCoordinationRecords(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM outreach_templates");
  if ((existing?.c ?? 0) > 0) return;
  for (const template of TEMPLATES) {
    execute(
      db,
      `INSERT INTO outreach_templates (id, locale, body, version) VALUES (?, ?, ?, ?)`,
      template.id,
      template.locale,
      template.body,
      OUTREACH_VERSION,
    );
  }
}

export function ensureCoordinationPolicy(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM outreach_templates");
  if ((existing?.c ?? 0) > 0) return;
  transaction(db, () => seedCoordinationRecords(db));
}

function requirePatient(db: AppDatabase, ctx: SessionContext, patientId: string) {
  const facilityId = facilityOf(ctx);
  const patient = get<{ id: string }>(
    db,
    `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  if (!patient) throw new NotFoundError();
  return facilityId;
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
    `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ctx.organizationId,
    key,
    ctx.userId,
    hash,
    JSON.stringify(body),
    now,
  );
}

export function setOutreachPreference(
  db: AppDatabase,
  ctx: SessionContext,
  input: { patientId: string; locale: string; channel: string; consent: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const facilityId = requirePatient(db, ctx, input.patientId);
  if (input.locale !== "en" && input.locale !== "es") throw new ValidationError("code");
  if (input.channel !== "portal" && input.channel !== "none") throw new ValidationError("code");
  if (input.consent !== "granted" && input.consent !== "withheld") throw new ValidationError("code");
  const hash = canonicalHash({ patientId: input.patientId, locale: input.locale, channel: input.channel, consent: input.consent });
  const existing = replay<{ patientId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const now = new Date().toISOString();
  const saved = { patientId: input.patientId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO patient_outreach (patient_id, organization_id, facility_id, locale, channel, consent, updated_by, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(patient_id) DO UPDATE SET locale = excluded.locale, channel = excluded.channel, consent = excluded.consent, updated_by = excluded.updated_by, updated_at = excluded.updated_at`,
      input.patientId,
      ctx.organizationId,
      facilityId,
      input.locale,
      input.channel,
      input.consent,
      ctx.userId,
      now,
    );
    writeAudit(db, ctx, { action: "care.preference", resourceType: "OutreachPreference", resourceId: input.patientId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

function escalate(db: AppDatabase, ctx: SessionContext, facilityId: string, patientId: string, templateId: string, failure: OutreachFailure, now: string) {
  const taskId = `tsk_${randomUUID()}`;
  execute(
    db,
    `INSERT INTO care_tasks (id, organization_id, facility_id, patient_id, kind, source_table, source_id, reason, failure, status, owner_id, due_at, created_by, created_at)
     VALUES (?, ?, ?, ?, 'escalation', NULL, NULL, ?, ?, 'open', NULL, NULL, ?, ?)`,
    taskId,
    ctx.organizationId,
    facilityId,
    patientId,
    `Outreach was not stored. Failure ${failure}. Template ${templateId}.`,
    failure,
    ctx.userId,
    now,
  );
  execute(
    db,
    `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'care.escalation', ?, ?)`,
    randomUUID(),
    ctx.organizationId,
    JSON.stringify({ taskId, patientId, templateId, failure }),
    now,
  );
  writeAudit(db, ctx, { action: "care.escalation", resourceType: "CareTask", resourceId: taskId, outcome: "success" });
  return taskId;
}

export function sendOutreach(db: AppDatabase, ctx: SessionContext, input: { patientId: string; templateId: string; idempotencyKey: string }): { outcome: "stored" | "escalated"; messageId?: string; taskId?: string; body?: string } {
  assertKey(input.idempotencyKey);
  const facilityId = requirePatient(db, ctx, input.patientId);
  if (!/^[a-z0-9_]{1,40}$/.test(input.templateId)) throw new ValidationError("code");
  const hash = canonicalHash({ patientId: input.patientId, templateId: input.templateId });
  const existing = replay<{ outcome: "stored" | "escalated"; messageId?: string; taskId?: string; body?: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const pref = get<{ locale: string; channel: string; consent: string }>(
    db,
    `SELECT locale, channel, consent FROM patient_outreach WHERE patient_id = ? AND organization_id = ? AND facility_id = ?`,
    input.patientId,
    ctx.organizationId,
    facilityId,
  );
  const template = pref
    ? get<{ body: string; version: string }>(
        db,
        `SELECT body, version FROM outreach_templates WHERE id = ? AND locale = ?`,
        input.templateId,
        pref.locale,
      )
    : undefined;
  const now = new Date().toISOString();
  return transaction(db, () => {
    const failure: OutreachFailure | null = !pref || pref.consent !== "granted" ? "consent" : pref.channel === "none" ? "channel" : !template ? "locale" : null;
    if (failure) {
      const taskId = escalate(db, ctx, facilityId, input.patientId, input.templateId, failure, now);
      const saved = { outcome: "escalated" as const, taskId };
      saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
      return saved;
    }
    if (!template || !pref) {
      const taskId = escalate(db, ctx, facilityId, input.patientId, input.templateId, "locale", now);
      const saved = { outcome: "escalated" as const, taskId };
      saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
      return saved;
    }
    const messageId = `msg_${randomUUID()}`;
    const body = holdOutreachBody(template.body, null);
    execute(
      db,
      `INSERT INTO outreach_messages (id, organization_id, facility_id, patient_id, template_id, locale, body, version, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      messageId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      input.templateId,
      pref.locale,
      body,
      template.version,
      ctx.userId,
      now,
    );
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'care.message', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ messageId, patientId: input.patientId, templateId: input.templateId, locale: pref.locale }),
      now,
    );
    writeAudit(db, ctx, { action: "care.message", resourceType: "OutreachMessage", resourceId: messageId, outcome: "success" });
    const saved = { outcome: "stored" as const, messageId, body };
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    return saved;
  });
}

export function createReferral(db: AppDatabase, ctx: SessionContext, input: { patientId: string; toFacilityId: string; reason: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  if (!canRegisterPatient(ctx)) {
    noteDenial(db, ctx, "care.referral", "CareReferral", null);
    throw new ForbiddenError();
  }
  const facilityId = requirePatient(db, ctx, input.patientId);
  const reason = clip(input.reason, 200);
  const target = get<{ id: string }>(
    db,
    `SELECT id FROM facilities WHERE id = ? AND organization_id = ? AND id <> ?`,
    input.toFacilityId,
    ctx.organizationId,
    facilityId,
  );
  if (!target) throw new NotFoundError();
  const hash = canonicalHash({ patientId: input.patientId, toFacilityId: target.id, reason });
  const existing = replay<{ referralId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const referralId = `ref_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { referralId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO care_referrals (id, organization_id, from_facility_id, to_facility_id, patient_id, reason, status, author_id, decided_by, created_at, decided_at)
       VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, NULL, ?, NULL)`,
      referralId,
      ctx.organizationId,
      facilityId,
      target.id,
      input.patientId,
      reason,
      ctx.userId,
      now,
    );
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'care.referral', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ referralId, patientId: input.patientId, toFacilityId: target.id, status: "requested" }),
      now,
    );
    writeAudit(db, ctx, { action: "care.referral", resourceType: "CareReferral", resourceId: referralId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function decideReferral(db: AppDatabase, ctx: SessionContext, input: { referralId: string; decision: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(ctx);
  if (input.decision !== "accepted" && input.decision !== "declined") throw new ValidationError("code");
  const referral = get<{ id: string; organization_id: string; to_facility_id: string; status: string }>(
    db,
    `SELECT id, organization_id, to_facility_id, status FROM care_referrals WHERE id = ?`,
    input.referralId,
  );
  if (!referral || referral.organization_id !== ctx.organizationId || referral.to_facility_id !== facilityId) {
    noteDenial(db, ctx, "care.referral", "CareReferral", input.referralId);
    throw new NotFoundError();
  }
  const hash = canonicalHash({ referralId: input.referralId, decision: input.decision });
  const existing = replay<{ referralId: string; status: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  if (referral.status !== "requested") throw new ConflictError("conflict", "That referral is already decided.");
  const now = new Date().toISOString();
  const saved = { referralId: referral.id, status: input.decision };
  transaction(db, () => {
    execute(
      db,
      `UPDATE care_referrals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ? AND status = 'requested'`,
      input.decision,
      ctx.userId,
      now,
      referral.id,
    );
    writeAudit(db, ctx, { action: "care.referral", resourceType: "CareReferral", resourceId: referral.id, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function draftCarePlan(db: AppDatabase, ctx: SessionContext, input: { patientId: string; goal: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  if (!canRegisterPatient(ctx)) {
    noteDenial(db, ctx, "care.plan", "CarePlan", null);
    throw new ForbiddenError();
  }
  const facilityId = requirePatient(db, ctx, input.patientId);
  const goal = clip(input.goal, 400);
  const hash = canonicalHash({ patientId: input.patientId, goal });
  const existing = replay<{ planId: string; goal: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const planId = `pln_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { planId, goal };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO care_plans (id, organization_id, facility_id, patient_id, goal, status, author_id, created_at) VALUES (?, ?, ?, ?, ?, 'draft', ?, ?)`,
      planId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      goal,
      ctx.userId,
      now,
    );
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'care.plan', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ planId, patientId: input.patientId, status: "draft" }),
      now,
    );
    writeAudit(db, ctx, { action: "care.plan", resourceType: "CarePlan", resourceId: planId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function activateCarePlan(db: AppDatabase, ctx: SessionContext, input: { planId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  if (!canRegisterPatient(ctx)) throw new ForbiddenError();
  const facilityId = facilityOf(ctx);
  const plan = get<{ id: string; organization_id: string; facility_id: string; status: string; goal: string }>(
    db,
    `SELECT id, organization_id, facility_id, status, goal FROM care_plans WHERE id = ?`,
    input.planId,
  );
  if (!plan || plan.organization_id !== ctx.organizationId || plan.facility_id !== facilityId) throw new NotFoundError();
  const hash = canonicalHash({ planId: input.planId });
  const existing = replay<{ planId: string; goal: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  if (plan.status !== "draft") throw new ConflictError("conflict", "That care plan is already active.");
  const now = new Date().toISOString();
  const saved = { planId: plan.id, goal: plan.goal };
  transaction(db, () => {
    execute(db, `UPDATE care_plans SET status = 'active' WHERE id = ? AND status = 'draft'`, plan.id);
    writeAudit(db, ctx, { action: "care.plan", resourceType: "CarePlan", resourceId: plan.id, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function createFollowUp(db: AppDatabase, ctx: SessionContext, input: { patientId: string; dueOn: string; reason: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  const facilityId = requirePatient(db, ctx, input.patientId);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueOn)) throw new ValidationError();
  const reason = clip(input.reason, 200);
  const hash = canonicalHash({ patientId: input.patientId, dueOn: input.dueOn, reason });
  const existing = replay<{ taskId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const taskId = `tsk_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { taskId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO care_tasks (id, organization_id, facility_id, patient_id, kind, source_table, source_id, reason, failure, status, owner_id, due_at, created_by, created_at)
       VALUES (?, ?, ?, ?, 'follow-up', NULL, NULL, ?, NULL, 'open', ?, ?, ?, ?)`,
      taskId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      reason,
      ctx.userId,
      input.dueOn,
      ctx.userId,
      now,
    );
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'care.task', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ taskId, patientId: input.patientId, kind: "follow-up" }),
      now,
    );
    writeAudit(db, ctx, { action: "care.task", resourceType: "CareTask", resourceId: taskId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function openGapTask(db: AppDatabase, ctx: SessionContext, input: { patientId: string; sourceId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  const facilityId = requirePatient(db, ctx, input.patientId);
  const chart = getChart(db, ctx, input.patientId);
  if (!chart) throw new NotFoundError();
  const gap = buildPatientState(chart).careGaps.find((item) => item.sourceId === input.sourceId);
  if (!gap) throw new ValidationError("code");
  const hash = canonicalHash({ patientId: input.patientId, sourceId: gap.sourceId, sourceTable: gap.sourceTable });
  const existing = replay<{ taskId: string; reason: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const taskId = `tsk_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { taskId, reason: gap.text };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO care_tasks (id, organization_id, facility_id, patient_id, kind, source_table, source_id, reason, failure, status, owner_id, due_at, created_by, created_at)
       VALUES (?, ?, ?, ?, 'gap', ?, ?, ?, NULL, 'open', NULL, NULL, ?, ?)`,
      taskId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      gap.sourceTable,
      gap.sourceId,
      gap.text,
      ctx.userId,
      now,
    );
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'care.task', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ taskId, patientId: input.patientId, kind: "gap", sourceId: gap.sourceId, sourceTable: gap.sourceTable }),
      now,
    );
    writeAudit(db, ctx, { action: "care.task", resourceType: "CareTask", resourceId: taskId, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
  });
  return saved;
}

export function claimCareTask(db: AppDatabase, ctx: SessionContext, input: { taskId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(ctx);
  const task = get<{ id: string; organization_id: string; facility_id: string; status: string; owner_id: string | null }>(
    db,
    `SELECT id, organization_id, facility_id, status, owner_id FROM care_tasks WHERE id = ?`,
    input.taskId,
  );
  if (!task || task.organization_id !== ctx.organizationId || task.facility_id !== facilityId) throw new NotFoundError();
  const hash = canonicalHash({ taskId: input.taskId });
  const existing = replay<{ taskId: string; ownerId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  if (task.status !== "open" || task.owner_id) throw new ConflictError("conflict", "That task already has an owner.");
  const saved = { taskId: task.id, ownerId: ctx.userId };
  transaction(db, () => {
    execute(db, `UPDATE care_tasks SET owner_id = ? WHERE id = ? AND owner_id IS NULL AND status = 'open'`, ctx.userId, task.id);
    writeAudit(db, ctx, { action: "care.task", resourceType: "CareTask", resourceId: task.id, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, new Date().toISOString());
  });
  return saved;
}

export function completeCareTask(db: AppDatabase, ctx: SessionContext, input: { taskId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(ctx);
  const task = get<{ id: string; organization_id: string; facility_id: string; status: string; owner_id: string | null }>(
    db,
    `SELECT id, organization_id, facility_id, status, owner_id FROM care_tasks WHERE id = ?`,
    input.taskId,
  );
  if (!task || task.organization_id !== ctx.organizationId || task.facility_id !== facilityId) throw new NotFoundError();
  const hash = canonicalHash({ taskId: input.taskId, action: "complete" });
  const existing = replay<{ taskId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  if (task.owner_id !== ctx.userId || task.status !== "open") throw new ConflictError("conflict", "Only the owner can complete an open task.");
  const saved = { taskId: task.id };
  transaction(db, () => {
    execute(db, `UPDATE care_tasks SET status = 'done' WHERE id = ? AND owner_id = ? AND status = 'open'`, task.id, ctx.userId);
    writeAudit(db, ctx, { action: "care.task", resourceType: "CareTask", resourceId: task.id, outcome: "success" });
    saveKey(db, ctx, input.idempotencyKey, hash, saved, new Date().toISOString());
  });
  return saved;
}

export type CoordinationView = {
  patientId: string;
  preference: { locale: string; channel: string; consent: string } | null;
  templates: { id: string; locales: string[] }[];
  messages: { id: string; templateId: string; locale: string; body: string; version: string }[];
  referrals: { id: string; toFacilityId: string; reason: string; status: string }[];
  plans: { id: string; goal: string; status: string }[];
  tasks: { id: string; kind: string; reason: string; failure: string | null; status: string; ownerId: string | null; dueAt: string | null; sourceId: string | null }[];
  gaps: { sourceId: string; sourceTable: string; text: string }[];
  targets: { id: string; name: string }[];
};

export function readCoordination(db: AppDatabase, ctx: SessionContext, patientId: string): CoordinationView | null {
  const facilityId = facilityOf(ctx);
  const chart = getChart(db, ctx, patientId);
  if (!chart) return null;
  const preference = get<{ locale: string; channel: string; consent: string }>(
    db,
    `SELECT locale, channel, consent FROM patient_outreach WHERE patient_id = ? AND organization_id = ? AND facility_id = ?`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  const templateRows = all<{ id: string; locale: string }>(db, `SELECT id, locale FROM outreach_templates ORDER BY id, locale`);
  const grouped = new Map<string, string[]>();
  for (const row of templateRows) grouped.set(row.id, [...(grouped.get(row.id) ?? []), row.locale]);
  const messages = all<{ id: string; template_id: string; locale: string; body: string; version: string }>(
    db,
    `SELECT id, template_id, locale, body, version FROM outreach_messages WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at`,
    ctx.organizationId,
    facilityId,
    patientId,
  );
  const referrals = all<{ id: string; to_facility_id: string; reason: string; status: string }>(
    db,
    `SELECT id, to_facility_id, reason, status FROM care_referrals WHERE organization_id = ? AND from_facility_id = ? AND patient_id = ? ORDER BY created_at`,
    ctx.organizationId,
    facilityId,
    patientId,
  );
  const plans = all<{ id: string; goal: string; status: string }>(
    db,
    `SELECT id, goal, status FROM care_plans WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at`,
    ctx.organizationId,
    facilityId,
    patientId,
  );
  const tasks = all<{ id: string; kind: string; reason: string; failure: string | null; status: string; owner_id: string | null; due_at: string | null; source_id: string | null }>(
    db,
    `SELECT id, kind, reason, failure, status, owner_id, due_at, source_id FROM care_tasks WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at`,
    ctx.organizationId,
    facilityId,
    patientId,
  );
  const targets = all<{ id: string; name: string }>(
    db,
    `SELECT id, name FROM facilities WHERE organization_id = ? AND id <> ? ORDER BY name`,
    ctx.organizationId,
    facilityId,
  );
  writeAudit(db, ctx, { action: "care.read", resourceType: "Care", resourceId: patientId, outcome: "success" });
  return {
    patientId,
    preference: preference ?? null,
    templates: [...grouped.entries()].map(([id, locales]) => ({ id, locales })),
    messages: messages.map((row) => ({ id: row.id, templateId: row.template_id, locale: row.locale, body: row.body, version: row.version })),
    referrals: referrals.map((row) => ({ id: row.id, toFacilityId: row.to_facility_id, reason: row.reason, status: row.status })),
    plans: plans.map((row) => ({ id: row.id, goal: row.goal, status: row.status })),
    tasks: tasks.map((row) => ({ id: row.id, kind: row.kind, reason: row.reason, failure: row.failure, status: row.status, ownerId: row.owner_id, dueAt: row.due_at, sourceId: row.source_id })),
    gaps: buildPatientState(chart).careGaps,
    targets,
  };
}

export function listIncomingReferrals(db: AppDatabase, ctx: SessionContext) {
  const facilityId = facilityOf(ctx);
  const rows = all<{ id: string; patient_id: string; from_facility_id: string; reason: string; status: string }>(
    db,
    `SELECT id, patient_id, from_facility_id, reason, status FROM care_referrals WHERE organization_id = ? AND to_facility_id = ? ORDER BY created_at`,
    ctx.organizationId,
    facilityId,
  );
  writeAudit(db, ctx, { action: "care.referral", resourceType: "CareReferral", resourceId: facilityId, outcome: "success" });
  return rows.map((row) => ({ id: row.id, patientId: row.patient_id, fromFacilityId: row.from_facility_id, reason: row.reason, status: row.status }));
}

export function explainCoordination(db: AppDatabase, ctx: SessionContext, input: { patientId: string; idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  const view = readCoordination(db, ctx, input.patientId);
  if (!view) throw new NotFoundError();
  const gateway = invokeGateway(
    db,
    ctx,
    { promptId: GATEWAY_PROMPT.id, promptVersion: GATEWAY_PROMPT.version, text: "Explain the listed care identifiers.", idempotencyKey: input.idempotencyKey },
    adapter,
  );
  return {
    messages: view.messages.map((message) => ({ ...message, body: holdOutreachBody(message.body, gateway.output) })),
    plans: view.plans.map((plan) => ({ ...plan, goal: holdOutreachBody(plan.goal, gateway.output) })),
    aiOutcome: gateway.outcome,
    aiText: null,
  };
}
