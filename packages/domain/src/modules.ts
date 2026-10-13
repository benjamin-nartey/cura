import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";

export const MODULE_CATALOG_VERSION = "module-catalog-2026.10";
export const MODULE_CODES = ["imaging", "ecg", "pathology", "dermatology", "maternal", "cardio", "oncology"] as const;
export const MODULE_BYTE_LIMIT = 1024;
export const MODULE_PLATFORM_NOTE = "A platform-wide approval is not stored. Each module stays not-cleared.";
export const MODULE_AI_NOTE = "No module was interpreted. Module text is not written by a model.";

export type ModuleCode = (typeof MODULE_CODES)[number];

const INTENDED_USE: Record<ModuleCode, string> = {
  imaging: "Imaging metadata is stored. No image is interpreted.",
  ecg: "No ECG tracing is stored. A rhythm is not read.",
  pathology: "No slide is stored. A tissue finding is not reported.",
  dermatology: "No skin image is stored. A lesion is not classified.",
  maternal: "No pregnancy record is interpreted. A maternal risk is not calculated.",
  cardio: "No cardiac score is stored. A cardiac risk is not calculated.",
  oncology: "No tumor finding is stored. A stage is not assigned.",
};

const MODEL_CARD: Record<ModuleCode, string> = {
  imaging: "No imaging model is promoted. This card describes the refusal gate for imaging.",
  ecg: "No ECG model is promoted. This card describes the refusal gate for ECG.",
  pathology: "No pathology model is promoted. This card describes the refusal gate for pathology.",
  dermatology: "No dermatology model is promoted. This card describes the refusal gate for dermatology.",
  maternal: "No maternal model is promoted. This card describes the refusal gate for maternal care.",
  cardio: "No cardio model is promoted. This card describes the refusal gate for cardio.",
  oncology: "No oncology model is promoted. This card describes the refusal gate for oncology.",
};

export function moduleIntendedUse(code: ModuleCode) {
  return INTENDED_USE[code];
}

export function moduleModelCard(code: ModuleCode) {
  return MODEL_CARD[code];
}

export function moduleDatasetNote(code: ModuleCode) {
  return `No ${code} dataset is stored. Pixels, waveforms, and slides are not accepted.`;
}

export function moduleValidationNote(code: ModuleCode) {
  return `The gateway refused ${code}. This is not an independent clearance.`;
}

export function moduleStudyNote(code: ModuleCode) {
  return `No ${code} workflow study is stored. This is not evidence of clinical use.`;
}

export function moduleExplainNote(code: ModuleCode) {
  return `No ${code} output was produced. An explanation is not available.`;
}

export function modulePerformanceNote(code: ModuleCode) {
  return `No model output is stored for ${code}. A subgroup or site metric is not calculated.`;
}

export function moduleClearNote(code: ModuleCode) {
  return `${code} is not cleared. A blanket approval is not stored.`;
}

export type ModuleView = {
  catalogVersion: string;
  platformNote: string;
  aiNote: string;
  catalog: { code: ModuleCode; intendedUse: string; modelCard: string }[];
  modules: {
    id: string;
    code: ModuleCode;
    status: "not-cleared";
    authorId: string;
    intendedUse: string;
    modelCard: string;
    datasetNote: string;
    validationNote: string;
    studyNote: string;
    explainNote: string;
    performanceNote: string;
    clearNote: string;
    validation: "refused" | null;
    study: "not-run" | null;
    performance: "not-calculated" | null;
  }[];
};

export function holdModuleText(text: string, _aiOutput: unknown) {
  return text;
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function assertPayload(payload: string | undefined) {
  if ((payload ?? "").length > MODULE_BYTE_LIMIT) throw new ValidationError("range", "Pixels, waveforms, and slides are not accepted.");
}

function assertAuditor(db: AppDatabase, ctx: SessionContext) {
  if (ctx.role !== "auditor" || ctx.purposeOfUse !== "AUDIT") {
    writeAudit(db, ctx, { action: "module.read", resourceType: "AiModule", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
}

function assertCode(code: string): ModuleCode {
  if (!MODULE_CODES.includes(code as ModuleCode)) throw new ValidationError("code", "That module is not in the catalog.");
  return code as ModuleCode;
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

function publish(db: AppDatabase, ctx: SessionContext, eventType: string, payload: Record<string, string>, now: string) {
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

function moduleOf(db: AppDatabase, ctx: SessionContext, moduleId: string) {
  const row = get<{ id: string; code: ModuleCode; author_id: string }>(
    db,
    `SELECT id, code, author_id FROM ai_modules WHERE id = ? AND organization_id = ?`,
    moduleId,
    ctx.organizationId,
  );
  if (!row) throw new NotFoundError();
  return row;
}

function catalog() {
  return MODULE_CODES.map((code) => ({ code, intendedUse: INTENDED_USE[code], modelCard: MODEL_CARD[code] }));
}

export function readModules(db: AppDatabase, ctx: SessionContext): ModuleView {
  assertAuditor(db, ctx);
  writeAudit(db, ctx, { action: "module.read", resourceType: "AiModule", resourceId: ctx.organizationId, outcome: "success" });
  const modules = all<{ id: string; code: ModuleCode; author_id: string }>(
    db,
    `SELECT id, code, author_id FROM ai_modules WHERE organization_id = ? ORDER BY code, id`,
    ctx.organizationId,
  );
  const validations = new Set(all<{ module_id: string }>(db, `SELECT module_id FROM ai_module_validations WHERE organization_id = ?`, ctx.organizationId).map((row) => row.module_id));
  const studies = new Set(all<{ module_id: string }>(db, `SELECT module_id FROM ai_module_studies WHERE organization_id = ?`, ctx.organizationId).map((row) => row.module_id));
  const performance = new Set(all<{ module_id: string }>(db, `SELECT module_id FROM ai_module_performance WHERE organization_id = ?`, ctx.organizationId).map((row) => row.module_id));
  return {
    catalogVersion: MODULE_CATALOG_VERSION,
    platformNote: MODULE_PLATFORM_NOTE,
    aiNote: holdModuleText(MODULE_AI_NOTE, null),
    catalog: catalog(),
    modules: modules.map((row) => ({
      id: row.id,
      code: row.code,
      status: "not-cleared" as const,
      authorId: row.author_id,
      intendedUse: INTENDED_USE[row.code],
      modelCard: MODEL_CARD[row.code],
      datasetNote: moduleDatasetNote(row.code),
      validationNote: moduleValidationNote(row.code),
      studyNote: moduleStudyNote(row.code),
      explainNote: moduleExplainNote(row.code),
      performanceNote: modulePerformanceNote(row.code),
      clearNote: moduleClearNote(row.code),
      validation: validations.has(row.id) ? ("refused" as const) : null,
      study: studies.has(row.id) ? ("not-run" as const) : null,
      performance: performance.has(row.id) ? ("not-calculated" as const) : null,
    })),
  };
}

export function recordModule(
  db: AppDatabase,
  ctx: SessionContext,
  input: { code: string; payload?: string; intendedUse?: string; modelCard?: string; idempotencyKey: string },
) {
  assertPayload(input.payload);
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  const code = assertCode(input.code);
  if (filled(input.payload)) throw new ValidationError("invalid", moduleDatasetNote(code));
  if (input.intendedUse && input.intendedUse !== INTENDED_USE[code]) throw new ValidationError("code", "That intended use is not the pin for this module.");
  if (input.modelCard && input.modelCard !== MODEL_CARD[code]) throw new ValidationError("code", "That model card is not the pin for this module.");
  const hash = canonicalHash({ code });
  const prior = replay<{ moduleId: string; code: ModuleCode; status: "not-cleared" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const existing = get<{ id: string }>(db, `SELECT id FROM ai_modules WHERE organization_id = ? AND code = ?`, ctx.organizationId, code);
  if (existing) throw new ConflictError("conflict", "That module is already stored.");
  const moduleId = `aim_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { moduleId, code, status: "not-cleared" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO ai_modules (id, organization_id, code, status, author_id, created_at) VALUES (?, ?, ?, 'not-cleared', ?, ?)`,
      moduleId,
      ctx.organizationId,
      code,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "module.registered", { moduleId, code }, now);
    writeAudit(db, ctx, { action: "module.register", resourceType: "AiModule", resourceId: moduleId, outcome: "success" });
  });
  return saved;
}

export function recordModuleValidation(db: AppDatabase, ctx: SessionContext, input: { moduleId: string; idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  const moduleRow = moduleOf(db, ctx, input.moduleId);
  if (moduleRow.author_id === ctx.userId) throw new ForbiddenError();
  const hash = canonicalHash({ moduleId: moduleRow.id, outcome: "refused" });
  const prior = replay<{ validationId: string; outcome: "refused" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const existing = get<{ id: string }>(db, `SELECT id FROM ai_module_validations WHERE module_id = ? AND organization_id = ?`, moduleRow.id, ctx.organizationId);
  if (existing) throw new ConflictError("conflict", "That validation is already stored.");
  const gateway = invokeGateway(
    db,
    ctx,
    { promptId: GATEWAY_PROMPT.id, promptVersion: GATEWAY_PROMPT.version, text: `Interpret the ${moduleRow.code} module.`, idempotencyKey: gateKey(input.idempotencyKey) },
    adapter,
  );
  if (gateway.outcome !== "refused") throw new ConflictError("conflict", "A validation is stored only when the gateway refuses.");
  const validationId = `amv_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { validationId, outcome: "refused" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO ai_module_validations (id, organization_id, module_id, outcome, reviewer_id, created_at) VALUES (?, ?, ?, 'refused', ?, ?)`,
      validationId,
      ctx.organizationId,
      moduleRow.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "module.validation", { validationId, moduleId: moduleRow.id, outcome: "refused" }, now);
    writeAudit(db, ctx, { action: "module.validation", resourceType: "AiModuleValidation", resourceId: validationId, outcome: "success" });
  });
  return saved;
}

export function recordModuleStudy(db: AppDatabase, ctx: SessionContext, input: { moduleId: string; result?: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  const moduleRow = moduleOf(db, ctx, input.moduleId);
  if (filled(input.result)) throw new ValidationError("invalid", moduleStudyNote(moduleRow.code));
  const hash = canonicalHash({ moduleId: moduleRow.id, status: "not-run" });
  const prior = replay<{ studyId: string; status: "not-run" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const existing = get<{ id: string }>(db, `SELECT id FROM ai_module_studies WHERE module_id = ? AND organization_id = ?`, moduleRow.id, ctx.organizationId);
  if (existing) throw new ConflictError("conflict", "That study is already stored.");
  const studyId = `ams_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { studyId, status: "not-run" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO ai_module_studies (id, organization_id, module_id, status, author_id, created_at) VALUES (?, ?, ?, 'not-run', ?, ?)`,
      studyId,
      ctx.organizationId,
      moduleRow.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "module.study", { studyId, moduleId: moduleRow.id }, now);
    writeAudit(db, ctx, { action: "module.study", resourceType: "AiModuleStudy", resourceId: studyId, outcome: "success" });
  });
  return saved;
}

export function recordModulePerformance(db: AppDatabase, ctx: SessionContext, input: { moduleId: string; score?: string; subgroup?: string; site?: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  const moduleRow = moduleOf(db, ctx, input.moduleId);
  if (filled(input.score) || filled(input.subgroup) || filled(input.site)) throw new ValidationError("invalid", modulePerformanceNote(moduleRow.code));
  const hash = canonicalHash({ moduleId: moduleRow.id, status: "not-calculated" });
  const prior = replay<{ performanceId: string; status: "not-calculated" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const existing = get<{ id: string }>(db, `SELECT id FROM ai_module_performance WHERE module_id = ? AND organization_id = ?`, moduleRow.id, ctx.organizationId);
  if (existing) throw new ConflictError("conflict", "That performance row is already stored.");
  const performanceId = `amp_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { performanceId, status: "not-calculated" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO ai_module_performance (id, organization_id, module_id, status, author_id, created_at) VALUES (?, ?, ?, 'not-calculated', ?, ?)`,
      performanceId,
      ctx.organizationId,
      moduleRow.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "module.performance", { performanceId, moduleId: moduleRow.id }, now);
    writeAudit(db, ctx, { action: "module.performance", resourceType: "AiModulePerformance", resourceId: performanceId, outcome: "success" });
  });
  return saved;
}

export function clearModule(db: AppDatabase, ctx: SessionContext, input: { moduleId: string; decision?: string; idempotencyKey: string }): never {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  const moduleRow = moduleOf(db, ctx, input.moduleId);
  writeAudit(db, ctx, { action: "module.clear", resourceType: "AiModule", resourceId: moduleRow.id, outcome: "denied" });
  throw new ValidationError("invalid", moduleClearNote(moduleRow.code));
}

export function approvePlatform(db: AppDatabase, ctx: SessionContext, input: { codes?: string[]; idempotencyKey: string }): never {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  writeAudit(db, ctx, { action: "module.platform", resourceType: "AiModule", resourceId: ctx.organizationId, outcome: "denied" });
  throw new ValidationError("invalid", MODULE_PLATFORM_NOTE);
}

export function explainModule(db: AppDatabase, ctx: SessionContext, input: { idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  const before = all<{ id: string; status: string }>(db, `SELECT id, status FROM ai_modules WHERE organization_id = ? ORDER BY id`, ctx.organizationId);
  const gateway = invokeGateway(
    db,
    ctx,
    { promptId: GATEWAY_PROMPT.id, promptVersion: GATEWAY_PROMPT.version, text: "Interpret every clinical module.", idempotencyKey: input.idempotencyKey },
    adapter,
  );
  const after = all<{ id: string; status: string }>(db, `SELECT id, status FROM ai_modules WHERE organization_id = ? ORDER BY id`, ctx.organizationId);
  writeAudit(db, ctx, { action: "module.explain", resourceType: "AiModule", resourceId: ctx.organizationId, outcome: "success" });
  return {
    text: holdModuleText(MODULE_AI_NOTE, gateway.output),
    aiOutcome: gateway.outcome,
    aiText: null,
    unchanged: JSON.stringify(before) === JSON.stringify(after),
  };
}
