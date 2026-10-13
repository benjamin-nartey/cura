import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { deviceMeasurementsWithoutObservation } from "./devices";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";
import { canReadChart, canRegisterPatient, assertDevDirectory } from "./session";

export const PATIENT_COPY_VERSION = "patient-explain-2026.10";
export const TRIAGE_TEXT =
  "This is not an evaluation. If this may be an emergency, call local emergency services now. This app does not diagnose or give treatment advice.";

export const PATIENT_TOOLS = ["own-appointments", "own-medications", "own-results", "store-question", "urgent-triage"] as const;
export type PatientTool = (typeof PATIENT_TOOLS)[number];

const CLINICIAN_AI_TOOLS = ["tool_chart_sources", "tool_propose_review", "copilot", "documentation", "prescribe", "evidence"];
const URGENT = /\b(chest pain|trouble breathing|shortness of breath|cannot breathe|stroke|face droop|severe bleeding|suicid|kill myself|unconscious|seizure)\b/i;
const SESSION_HOURS = 12;

const EDUCATION = [
  ["edu_results", "Results on this page repeat values stored at your facility. They are not a diagnosis."],
  ["edu_meds", "The medication list repeats active rows on your facility record. It is not a dosing change."],
  ["edu_visits", "A booked appointment is already on the facility record. A request is not a booking until the facility accepts it."],
] as const;

export type PatientContext = SessionContext & {
  role: "patient";
  purposeOfUse: "PATIENT";
  facilityId: string;
  patientId: string;
};

export type PortalResult = {
  display: string;
  value: number;
  unit: string;
  interpretation: string;
  at: string;
  explanation: string;
  version: string;
};

export type PatientPortal = {
  patientId: string;
  givenName: string;
  familyName: string;
  mrn: string;
  birthDate: string;
  education: { id: string; body: string; version: string }[];
  allergies: { display: string; reaction: string }[];
  medications: { display: string; dose: string; status: string }[];
  appointments: { id: string; status: string; reason: string; startsAt: string; endsAt: string }[];
  results: PortalResult[];
  requests: { id: string; reason: string; status: string; startsAt: string | null; endsAt: string | null }[];
  questions: { id: string; text: string; outcome: "stored" | "triage"; instruction: string | null }[];
  messages: { id: string; body: string; author: "patient" | "facility" }[];
  coverage: { payerName: string; memberId: string } | null;
  payments: { id: string; description: string; amountCents: number; status: "recorded" }[];
};

export type PatientDesk = {
  patientId: string;
  questions: PatientPortal["questions"];
  messages: PatientPortal["messages"];
  requests: PatientPortal["requests"];
  coverage: PatientPortal["coverage"];
  payments: PatientPortal["payments"];
};

type PrincipalRow = {
  id: string;
  organization_id: string;
  facility_id: string;
  patient_id: string;
  display_name: string;
  organization_name: string;
  facility_name: string;
};

export function assertPatientTool(tool: string): asserts tool is PatientTool {
  if (!(PATIENT_TOOLS as readonly string[]).includes(tool) || CLINICIAN_AI_TOOLS.includes(tool)) throw new ForbiddenError();
}

export function holdPatientInstruction(instruction: string, _aiOutput: unknown) {
  return instruction;
}

export function resultExplanation(interpretation: string) {
  if (interpretation === "high") return "This stored result is marked above the reference range on the facility record. It is not a diagnosis.";
  if (interpretation === "low") return "This stored result is marked below the reference range on the facility record. It is not a diagnosis.";
  if (interpretation === "normal") return "This stored result is inside the reference range on the facility record. It is not a diagnosis.";
  return "This stored result is on the facility record. It is not a diagnosis.";
}

export function seedPatientRecords(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM patient_education");
  if ((existing?.c ?? 0) > 0) return;
  for (const [id, body] of EDUCATION) {
    execute(db, `INSERT INTO patient_education (id, body, version) VALUES (?, ?, ?)`, id, body, PATIENT_COPY_VERSION);
  }
  const people = [
    ["pac_elena", "org_harborlight", "fac_riverside", "pat_elena", "Elena Voss"],
    ["pac_mateo", "org_harborlight", "fac_riverside", "pat_mateo", "Mateo Ruiz"],
  ] as const;
  for (const [id, orgId, facilityId, patientId, name] of people) {
    execute(
      db,
      `INSERT INTO patient_principals (id, organization_id, facility_id, patient_id, display_name) VALUES (?, ?, ?, ?, ?)`,
      id,
      orgId,
      facilityId,
      patientId,
      name,
    );
  }
}

const PATIENT_ACCESS = [
  ["pac_walter", "pat_walter"],
  ["pac_jonah", "pat_jonah"],
  ["pac_owen", "pat_owen"],
  ["pac_farah", "pat_farah"],
  ["pac_grace", "pat_grace"],
] as const;

function ensurePatientAccess(db: AppDatabase) {
  for (const [id, patientId] of PATIENT_ACCESS) {
    execute(
      db,
      `INSERT OR IGNORE INTO patient_principals (id, organization_id, facility_id, patient_id, display_name)
       SELECT ?, organization_id, facility_id, id, given_name || ' ' || family_name FROM patients WHERE id = ?`,
      id,
      patientId,
    );
  }
}

export function ensurePatientPolicy(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM patient_education");
  if ((existing?.c ?? 0) === 0) transaction(db, () => seedPatientRecords(db));
  ensurePatientAccess(db);
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function clean(value: string, min: number, max: number) {
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new ValidationError();
  if (/\d{13,19}/.test(trimmed.replace(/[\s-]/g, ""))) throw new ValidationError();
  return trimmed;
}

function amountOf(value: number) {
  if (!Number.isInteger(value) || value < 1 || value > 500_000) throw new ValidationError("range");
  return value;
}

function instant(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ValidationError();
  return new Date(parsed).toISOString();
}

function replay<T>(db: AppDatabase, organizationId: string, key: string, hash: string): T | undefined {
  const row = get<{ request_hash: string; response_json: string }>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    organizationId,
    key,
  );
  if (!row) return undefined;
  if (row.request_hash !== hash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  return JSON.parse(row.response_json) as T;
}

function saveKey(db: AppDatabase, organizationId: string, actorId: string, key: string, hash: string, body: unknown, now: string) {
  execute(
    db,
    `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    organizationId,
    key,
    actorId,
    hash,
    JSON.stringify(body),
    now,
  );
}

function publish(db: AppDatabase, organizationId: string, eventType: string, payload: Record<string, string>, now: string) {
  execute(
    db,
    `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    organizationId,
    eventType,
    JSON.stringify(payload),
    now,
  );
}

function loadPrincipal(db: AppDatabase, principalId: string) {
  return get<PrincipalRow>(
    db,
    `SELECT p.id, p.organization_id, p.facility_id, p.patient_id, p.display_name,
            o.name AS organization_name, f.name AS facility_name
     FROM patient_principals p
     JOIN organizations o ON o.id = p.organization_id
     JOIN facilities f ON f.id = p.facility_id
     WHERE p.id = ?`,
    principalId,
  );
}

function toPatient(sessionId: string, row: PrincipalRow): PatientContext {
  return {
    sessionId,
    userId: row.id,
    displayName: row.display_name,
    role: "patient",
    purposeOfUse: "PATIENT",
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    facilityId: row.facility_id,
    facilityName: row.facility_name,
    patientId: row.patient_id,
  };
}

export function listPatientDirectory(db: AppDatabase) {
  assertDevDirectory();
  const rows = all<PrincipalRow>(
    db,
    `SELECT p.id, p.organization_id, p.facility_id, p.patient_id, p.display_name,
            o.name AS organization_name, f.name AS facility_name
     FROM patient_principals p
     JOIN organizations o ON o.id = p.organization_id
     JOIN facilities f ON f.id = p.facility_id
     ORDER BY o.name, f.name, p.display_name`,
  );
  return rows.map((row) => ({
    principalId: row.id,
    displayName: row.display_name,
    patientId: row.patient_id,
    organizationName: row.organization_name,
    facilityName: row.facility_name,
  }));
}

export function openPatientSession(db: AppDatabase, principalId: string) {
  assertDevDirectory();
  const row = loadPrincipal(db, principalId);
  if (!row) throw new NotFoundError("That directory entry does not exist.");
  const now = new Date();
  const sessionId = randomUUID();
  const expires = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  execute(
    db,
    `INSERT INTO patient_sessions (id, principal_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)`,
    sessionId,
    row.id,
    now.toISOString(),
    expires,
  );
  const ctx = toPatient(sessionId, row);
  writeAudit(db, ctx, { action: "portal.session", resourceType: "PatientSession", resourceId: sessionId, outcome: "success" });
  return { sessionId, expiresAt: expires };
}

export function readPatientSession(db: AppDatabase, sessionId: string): PatientContext | null {
  const row = get<{ principal_id: string; expires_at: string }>(
    db,
    `SELECT principal_id, expires_at FROM patient_sessions WHERE id = ? AND revoked_at IS NULL`,
    sessionId,
  );
  if (!row || Date.parse(row.expires_at) <= Date.now()) return null;
  const principal = loadPrincipal(db, row.principal_id);
  if (!principal) return null;
  return toPatient(sessionId, principal);
}

export function closePatientSession(db: AppDatabase, sessionId: string) {
  const ctx = readPatientSession(db, sessionId);
  execute(db, `UPDATE patient_sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`, new Date().toISOString(), sessionId);
  if (ctx) writeAudit(db, ctx, { action: "portal.session", resourceType: "PatientSession", resourceId: sessionId, outcome: "success" });
}

function requireOwn(ctx: PatientContext) {
  if (ctx.role !== "patient" || ctx.purposeOfUse !== "PATIENT" || !ctx.patientId || !ctx.facilityId) throw new ForbiddenError();
  return ctx;
}

function clinicianFacility(ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx) || ctx.role === "patient") throw new ForbiddenError();
  return ctx.facilityId;
}

function questionsFor(db: AppDatabase, organizationId: string, facilityId: string, patientId: string) {
  return all<{ id: string; text: string; outcome: "stored" | "triage"; instruction: string | null }>(
    db,
    `SELECT id, text, outcome, instruction FROM patient_questions
     WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at`,
    organizationId,
    facilityId,
    patientId,
  );
}

function messagesFor(db: AppDatabase, organizationId: string, facilityId: string, patientId: string) {
  return all<{ id: string; body: string; author_kind: "patient" | "facility" }>(
    db,
    `SELECT id, body, author_kind FROM patient_messages
     WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at`,
    organizationId,
    facilityId,
    patientId,
  ).map((row) => ({ id: row.id, body: row.body, author: row.author_kind }));
}

function requestsFor(db: AppDatabase, organizationId: string, facilityId: string, patientId: string) {
  return all<{ id: string; reason: string; status: string; starts_at: string | null; ends_at: string | null }>(
    db,
    `SELECT id, reason, status, starts_at, ends_at FROM patient_requests
     WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at`,
    organizationId,
    facilityId,
    patientId,
  ).map((row) => ({ id: row.id, reason: row.reason, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at }));
}

function coverageFor(db: AppDatabase, organizationId: string, facilityId: string, patientId: string) {
  const row = get<{ payer_name: string; member_id: string }>(
    db,
    `SELECT payer_name, member_id FROM patient_coverage WHERE organization_id = ? AND facility_id = ? AND patient_id = ?`,
    organizationId,
    facilityId,
    patientId,
  );
  return row ? { payerName: row.payer_name, memberId: row.member_id } : null;
}

function paymentsFor(db: AppDatabase, organizationId: string, facilityId: string, patientId: string) {
  return all<{ id: string; description: string; amount_cents: number; status: "recorded" }>(
    db,
    `SELECT id, description, amount_cents, status FROM patient_payments
     WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at`,
    organizationId,
    facilityId,
    patientId,
  ).map((row) => ({ id: row.id, description: row.description, amountCents: row.amount_cents, status: row.status }));
}

function resultsFor(db: AppDatabase, organizationId: string, facilityId: string, patientId: string): PortalResult[] {
  const stored = all<{ display: string; value: number; unit: string; interpretation: string; effective_at: string }>(
    db,
    `SELECT display, value, unit, interpretation, effective_at FROM observations
     WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY effective_at DESC`,
    organizationId,
    facilityId,
    patientId,
  ).map((row) => ({
    display: row.display,
    value: row.value,
    unit: row.unit,
    interpretation: row.interpretation,
    at: row.effective_at,
    explanation: resultExplanation(row.interpretation),
    version: PATIENT_COPY_VERSION,
  }));
  const typed = deviceMeasurementsWithoutObservation(db, organizationId, facilityId, patientId).map((row) => ({
    display: row.display,
    value: row.value,
    unit: row.unit,
    interpretation: row.interpretation,
    at: row.effectiveAt,
    explanation: resultExplanation(row.interpretation),
    version: PATIENT_COPY_VERSION,
  }));
  return [...stored, ...typed].sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : a.display.localeCompare(b.display)));
}

export function readPortal(db: AppDatabase, ctx: PatientContext): PatientPortal {
  const own = requireOwn(ctx);
  const patient = get<{ given_name: string; family_name: string; mrn: string; birth_date: string }>(
    db,
    `SELECT given_name, family_name, mrn, birth_date FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    own.patientId,
    own.organizationId,
    own.facilityId,
  );
  if (!patient) throw new NotFoundError();
  const education = all<{ id: string; body: string; version: string }>(db, `SELECT id, body, version FROM patient_education ORDER BY id`);
  const allergies = all<{ display: string; reaction: string }>(
    db,
    `SELECT display, reaction FROM allergies WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY recorded_at`,
    own.organizationId,
    own.facilityId,
    own.patientId,
  );
  const medications = all<{ display: string; dose: string; status: string }>(
    db,
    `SELECT display, dose, status FROM medications WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY recorded_at`,
    own.organizationId,
    own.facilityId,
    own.patientId,
  );
  const appointments = all<{ id: string; status: string; reason: string; starts_at: string; ends_at: string }>(
    db,
    `SELECT id, status, reason, starts_at, ends_at FROM appointments WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY starts_at`,
    own.organizationId,
    own.facilityId,
    own.patientId,
  ).map((row) => ({ id: row.id, status: row.status, reason: row.reason, startsAt: row.starts_at, endsAt: row.ends_at }));
  const view: PatientPortal = {
    patientId: own.patientId,
    givenName: patient.given_name,
    familyName: patient.family_name,
    mrn: patient.mrn,
    birthDate: patient.birth_date,
    education,
    allergies,
    medications,
    appointments,
    results: resultsFor(db, own.organizationId, own.facilityId, own.patientId),
    requests: requestsFor(db, own.organizationId, own.facilityId, own.patientId),
    questions: questionsFor(db, own.organizationId, own.facilityId, own.patientId),
    messages: messagesFor(db, own.organizationId, own.facilityId, own.patientId),
    coverage: coverageFor(db, own.organizationId, own.facilityId, own.patientId),
    payments: paymentsFor(db, own.organizationId, own.facilityId, own.patientId),
  };
  writeAudit(db, own, { action: "portal.read", resourceType: "PatientPortal", resourceId: own.patientId, outcome: "success" });
  return view;
}

export function readPatientDesk(db: AppDatabase, ctx: SessionContext, patientId: string): PatientDesk | null {
  const facilityId = clinicianFacility(ctx);
  const patient = get<{ id: string }>(
    db,
    `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  if (!patient) return null;
  writeAudit(db, ctx, { action: "portal.desk", resourceType: "PatientDesk", resourceId: patientId, outcome: "success" });
  return {
    patientId,
    questions: questionsFor(db, ctx.organizationId, facilityId, patientId),
    messages: messagesFor(db, ctx.organizationId, facilityId, patientId),
    requests: requestsFor(db, ctx.organizationId, facilityId, patientId),
    coverage: coverageFor(db, ctx.organizationId, facilityId, patientId),
    payments: paymentsFor(db, ctx.organizationId, facilityId, patientId),
  };
}

function chooseTool(text: string): PatientTool {
  if (URGENT.test(text)) return "urgent-triage";
  if (/\b(medication|medicine|dose|prescription)\b/i.test(text)) return "own-medications";
  if (/\b(result|results|lab|potassium|glucose|pressure)\b/i.test(text)) return "own-results";
  if (/\b(appointment|visit|schedule)\b/i.test(text)) return "own-appointments";
  return "store-question";
}

function linesFor(tool: PatientTool, portal: PatientPortal) {
  if (tool === "own-medications") return portal.medications.map((item) => `${item.display} · ${item.dose} · ${item.status}`);
  if (tool === "own-results") return portal.results.map((item) => `${item.display} · ${item.value} ${item.unit} · ${item.explanation}`);
  if (tool === "own-appointments") return portal.appointments.map((item) => `${item.reason} · ${item.status} · ${item.startsAt}`);
  return [];
}

function storeQuestionRow(
  db: AppDatabase,
  ctx: PatientContext,
  input: { text: string; idempotencyKey: string; tool: PatientTool; callGateway: boolean },
  adapter?: GatewayAdapter,
) {
  const own = requireOwn(ctx);
  assertKey(input.idempotencyKey);
  assertPatientTool(input.tool);
  const text = clean(input.text, 1, 500);
  const tool = URGENT.test(text) ? "urgent-triage" : input.tool;
  assertPatientTool(tool);
  const hash = canonicalHash({ patientId: own.patientId, text, tool, callGateway: input.callGateway });
  const existing = replay<{ questionId: string; outcome: "stored" | "triage"; instruction: string | null; tool: PatientTool; lines: string[]; aiOutcome: string | null; aiText: null }>(
    db,
    own.organizationId,
    input.idempotencyKey,
    hash,
  );
  if (existing) return existing;
  const gateway = input.callGateway
    ? invokeGateway(
        db,
        own,
        {
          promptId: GATEWAY_PROMPT.id,
          promptVersion: GATEWAY_PROMPT.version,
          text: "Explain the patient's own record identifiers.",
          idempotencyKey: `pgw-${randomUUID().replace(/-/g, "")}`,
        },
        adapter,
      )
    : null;
  const instruction = tool === "urgent-triage" ? holdPatientInstruction(TRIAGE_TEXT, gateway?.output ?? { text: "you are fine" }) : null;
  const outcome = tool === "urgent-triage" ? "triage" : "stored";
  const portal = readPortal(db, own);
  const lines = instruction ? [] : linesFor(tool, portal);
  const questionId = `pq_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = {
    questionId,
    outcome: outcome as "stored" | "triage",
    instruction,
    tool,
    lines,
    aiOutcome: gateway?.outcome ?? null,
    aiText: null,
  };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO patient_questions (id, organization_id, facility_id, patient_id, text, outcome, instruction, tool, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      questionId,
      own.organizationId,
      own.facilityId,
      own.patientId,
      text,
      outcome,
      instruction,
      tool,
      now,
    );
    saveKey(db, own.organizationId, own.userId, input.idempotencyKey, hash, saved, now);
    publish(db, own.organizationId, "portal.question", { questionId, outcome, tool }, now);
    writeAudit(db, own, { action: input.callGateway ? "portal.ask" : "portal.question", resourceType: "PatientQuestion", resourceId: questionId, outcome: "success" });
  });
  return saved;
}

export function storePatientQuestion(db: AppDatabase, ctx: PatientContext, input: { text: string; idempotencyKey: string }) {
  const tool = chooseTool(input.text);
  return storeQuestionRow(db, ctx, { ...input, tool, callGateway: false });
}

export function askPatient(db: AppDatabase, ctx: PatientContext, input: { text: string; idempotencyKey: string }, adapter?: GatewayAdapter) {
  const tool = chooseTool(input.text);
  return storeQuestionRow(db, ctx, { ...input, tool, callGateway: true }, adapter);
}

export function explainPortal(db: AppDatabase, ctx: PatientContext, input: { idempotencyKey: string }, adapter?: GatewayAdapter) {
  const own = requireOwn(ctx);
  assertKey(input.idempotencyKey);
  const portal = readPortal(db, own);
  const gateway = invokeGateway(
    db,
    own,
    {
      promptId: GATEWAY_PROMPT.id,
      promptVersion: GATEWAY_PROMPT.version,
      text: "Explain the patient's own record identifiers.",
      idempotencyKey: input.idempotencyKey,
    },
    adapter,
  );
  return {
    results: portal.results.map((result) => ({ ...result, explanation: holdPatientInstruction(result.explanation, gateway.output) })),
    aiOutcome: gateway.outcome,
    aiText: null,
  };
}

export function sendPatientMessage(db: AppDatabase, ctx: PatientContext, input: { body: string; idempotencyKey: string }) {
  const own = requireOwn(ctx);
  assertKey(input.idempotencyKey);
  const body = clean(input.body, 1, 500);
  const hash = canonicalHash({ patientId: own.patientId, body, author: "patient" });
  const existing = replay<{ messageId: string }>(db, own.organizationId, input.idempotencyKey, hash);
  if (existing) return existing;
  const messageId = `pm_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { messageId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO patient_messages (id, organization_id, facility_id, patient_id, body, author_kind, created_at)
       VALUES (?, ?, ?, ?, ?, 'patient', ?)`,
      messageId,
      own.organizationId,
      own.facilityId,
      own.patientId,
      body,
      now,
    );
    saveKey(db, own.organizationId, own.userId, input.idempotencyKey, hash, saved, now);
    publish(db, own.organizationId, "portal.message", { messageId }, now);
    writeAudit(db, own, { action: "portal.message", resourceType: "PatientMessage", resourceId: messageId, outcome: "success" });
  });
  return saved;
}

export function replyToPatient(db: AppDatabase, ctx: SessionContext, input: { patientId: string; body: string; idempotencyKey: string }) {
  const facilityId = clinicianFacility(ctx);
  assertKey(input.idempotencyKey);
  const body = clean(input.body, 1, 500);
  const patient = get<{ id: string }>(
    db,
    `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    input.patientId,
    ctx.organizationId,
    facilityId,
  );
  if (!patient) throw new NotFoundError();
  const hash = canonicalHash({ patientId: input.patientId, body, author: "facility" });
  const existing = replay<{ messageId: string }>(db, ctx.organizationId, input.idempotencyKey, hash);
  if (existing) return existing;
  const messageId = `pm_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { messageId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO patient_messages (id, organization_id, facility_id, patient_id, body, author_kind, created_at)
       VALUES (?, ?, ?, ?, ?, 'facility', ?)`,
      messageId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      body,
      now,
    );
    saveKey(db, ctx.organizationId, ctx.userId, input.idempotencyKey, hash, saved, now);
    publish(db, ctx.organizationId, "portal.message", { messageId }, now);
    writeAudit(db, ctx, { action: "portal.reply", resourceType: "PatientMessage", resourceId: messageId, outcome: "success" });
  });
  return saved;
}

export function storeCoverage(db: AppDatabase, ctx: PatientContext, input: { payerName: string; memberId: string; idempotencyKey: string }) {
  const own = requireOwn(ctx);
  assertKey(input.idempotencyKey);
  const payerName = clean(input.payerName, 2, 80);
  const memberId = clean(input.memberId, 2, 40);
  const hash = canonicalHash({ patientId: own.patientId, payerName, memberId });
  const existing = replay<{ patientId: string }>(db, own.organizationId, input.idempotencyKey, hash);
  if (existing) return existing;
  const now = new Date().toISOString();
  const saved = { patientId: own.patientId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO patient_coverage (patient_id, organization_id, facility_id, payer_name, member_id, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(patient_id) DO UPDATE SET payer_name = excluded.payer_name, member_id = excluded.member_id, updated_at = excluded.updated_at`,
      own.patientId,
      own.organizationId,
      own.facilityId,
      payerName,
      memberId,
      now,
    );
    saveKey(db, own.organizationId, own.userId, input.idempotencyKey, hash, saved, now);
    publish(db, own.organizationId, "portal.coverage", { patientId: own.patientId }, now);
    writeAudit(db, own, { action: "portal.coverage", resourceType: "PatientCoverage", resourceId: own.patientId, outcome: "success" });
  });
  return saved;
}

export function recordPatientPayment(db: AppDatabase, ctx: PatientContext, input: { description: string; amountCents: number; idempotencyKey: string }) {
  const own = requireOwn(ctx);
  assertKey(input.idempotencyKey);
  const description = clean(input.description, 3, 120);
  const amountCents = amountOf(input.amountCents);
  const hash = canonicalHash({ patientId: own.patientId, description, amountCents });
  const existing = replay<{ paymentId: string; status: "recorded" }>(db, own.organizationId, input.idempotencyKey, hash);
  if (existing) return existing;
  const paymentId = `pay_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { paymentId, status: "recorded" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO patient_payments (id, organization_id, facility_id, patient_id, description, amount_cents, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'recorded', ?)`,
      paymentId,
      own.organizationId,
      own.facilityId,
      own.patientId,
      description,
      amountCents,
      now,
    );
    saveKey(db, own.organizationId, own.userId, input.idempotencyKey, hash, saved, now);
    publish(db, own.organizationId, "portal.payment", { paymentId }, now);
    writeAudit(db, own, { action: "portal.payment", resourceType: "PatientPayment", resourceId: paymentId, outcome: "success" });
  });
  return saved;
}

export function requestAppointment(db: AppDatabase, ctx: PatientContext, input: { reason: string; idempotencyKey: string }) {
  const own = requireOwn(ctx);
  assertKey(input.idempotencyKey);
  const reason = clean(input.reason, 3, 200);
  const hash = canonicalHash({ patientId: own.patientId, reason });
  const existing = replay<{ requestId: string; status: "requested" }>(db, own.organizationId, input.idempotencyKey, hash);
  if (existing) return existing;
  const requestId = `prq_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { requestId, status: "requested" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO patient_requests (id, organization_id, facility_id, patient_id, reason, status, starts_at, ends_at, appointment_id, created_at, decided_at)
       VALUES (?, ?, ?, ?, ?, 'requested', NULL, NULL, NULL, ?, NULL)`,
      requestId,
      own.organizationId,
      own.facilityId,
      own.patientId,
      reason,
      now,
    );
    saveKey(db, own.organizationId, own.userId, input.idempotencyKey, hash, saved, now);
    publish(db, own.organizationId, "portal.request", { requestId, status: "requested" }, now);
    writeAudit(db, own, { action: "portal.request", resourceType: "PatientRequest", resourceId: requestId, outcome: "success" });
  });
  return saved;
}

export function readPendingPatientRequest(db: AppDatabase, ctx: SessionContext, requestId: string) {
  if (!canRegisterPatient(ctx) || ctx.role === "patient" || !ctx.facilityId) throw new ForbiddenError();
  const request = get<{ id: string; patient_id: string; reason: string; status: string }>(
    db,
    `SELECT id, patient_id, reason, status FROM patient_requests WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    requestId,
    ctx.organizationId,
    ctx.facilityId,
  );
  if (!request) throw new NotFoundError();
  if (request.status !== "requested") throw new ConflictError("conflict", "That request was already decided.");
  return { requestId: request.id, patientId: request.patient_id, reason: request.reason };
}

export function decideAppointmentRequest(
  db: AppDatabase,
  ctx: SessionContext,
  input: { requestId: string; decision: string; startsAt?: string; endsAt?: string; appointmentId?: string; idempotencyKey: string },
) {
  if (!canRegisterPatient(ctx) || ctx.role === "patient" || !ctx.facilityId) throw new ForbiddenError();
  assertKey(input.idempotencyKey);
  if (input.decision !== "accepted" && input.decision !== "declined") throw new ValidationError("code");
  const supplied = input.appointmentId?.trim() ?? "";
  if (input.decision === "accepted" && supplied && !/^apt_[A-Za-z0-9-]{1,80}$/.test(supplied)) throw new ValidationError();
  const startsAt = input.decision === "accepted" ? instant(input.startsAt ?? "") : null;
  const endsAt = input.decision === "accepted" ? instant(input.endsAt ?? "") : null;
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new ValidationError();
  const hash = canonicalHash({
    requestId: input.requestId,
    decision: input.decision,
    startsAt,
    endsAt,
    ...(supplied ? { appointmentId: supplied } : {}),
  });
  const existing = replay<{ requestId: string; status: string; appointmentId: string | null }>(db, ctx.organizationId, input.idempotencyKey, hash);
  if (existing) return existing;
  const request = get<{ id: string; patient_id: string; reason: string; status: string }>(
    db,
    `SELECT id, patient_id, reason, status FROM patient_requests WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    input.requestId,
    ctx.organizationId,
    ctx.facilityId,
  );
  if (!request) throw new NotFoundError();
  if (request.status !== "requested") throw new ConflictError("conflict", "That request was already decided.");
  const appointmentId = input.decision === "accepted" ? supplied || `apt_${randomUUID()}` : null;
  const now = new Date().toISOString();
  const saved = { requestId: request.id, status: input.decision, appointmentId };
  transaction(db, () => {
    if (appointmentId && startsAt && endsAt) {
      execute(
        db,
        `INSERT INTO appointments (id, organization_id, facility_id, patient_id, status, reason, starts_at, ends_at)
         VALUES (?, ?, ?, ?, 'booked', ?, ?, ?)`,
        appointmentId,
        ctx.organizationId,
        ctx.facilityId,
        request.patient_id,
        request.reason,
        startsAt,
        endsAt,
      );
    }
    execute(
      db,
      `UPDATE patient_requests SET status = ?, starts_at = ?, ends_at = ?, appointment_id = ?, decided_at = ? WHERE id = ?`,
      input.decision,
      startsAt,
      endsAt,
      appointmentId,
      now,
      request.id,
    );
    saveKey(db, ctx.organizationId, ctx.userId, input.idempotencyKey, hash, saved, now);
    publish(db, ctx.organizationId, "portal.request", { requestId: request.id, status: input.decision }, now);
    writeAudit(db, ctx, { action: "portal.decision", resourceType: "PatientRequest", resourceId: request.id, outcome: "success" });
  });
  return saved;
}
