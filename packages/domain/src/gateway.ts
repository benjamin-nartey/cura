import { createHash, randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { ConflictError, ValidationError } from "./errors";

export const GATEWAY_PROMPT = { id: "prm_chart_draft", version: 1 };
export const GATEWAY_MODEL = { id: "mdl_none", version: "0" };

const OUTPUT_SCHEMA = JSON.stringify({ required: ["citations"], citationsMin: 1 });
const BLOCKED_OUTPUT = /recommend|diagnos|should start|likely has|prescrib|increase the dose/i;

export type GatewayAdapter = {
  provider: string;
  modelId: string;
  modelVersion: string;
  invoke: (input: { traceId: string; redactedInput: string }) => unknown;
};

export type GatewayResult = {
  traceId: string;
  outcome: "refused" | "unavailable" | "invalid-output" | "quota" | "accepted";
  reason: string;
  promptId: string;
  promptVersion: number;
  modelId: string;
  modelVersion: string;
  output: unknown | null;
};

type PromptRow = { id: string; version: number; purpose: string; status: string; output_schema_json: string };
type ModelRow = { id: string; version: string; provider: string; status: string };

export function redactGatewayInput(text: string) {
  const redacted = text.replace(/\b[A-Z]{3}-\d{3,6}\b/g, "[redacted]").replace(/\b(?:pat|usr)_[a-z0-9_]+\b/gi, "[redacted]");
  return { redacted, changed: redacted !== text, hash: createHash("sha256").update(redacted).digest("hex") };
}

export function validateStructuredOutput(schemaJson: string, value: unknown) {
  const schema = JSON.parse(schemaJson) as { required?: string[]; citationsMin?: number };
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  for (const key of schema.required ?? []) {
    if (!(key in record)) return false;
  }
  const citationsMin = schema.citationsMin ?? 0;
  if (citationsMin > 0) {
    if (!Array.isArray(record.citations) || record.citations.length < citationsMin) return false;
    if (record.citations.some((item) => typeof item !== "string" || item.length < 1)) return false;
  }
  const texts: string[] = [];
  for (const item of Object.values(record)) {
    if (typeof item === "string") texts.push(item);
  }
  if (texts.some((item) => BLOCKED_OUTPUT.test(item))) return false;
  return true;
}

export function seedGatewayRecords(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM gateway_prompts");
  if ((existing?.c ?? 0) > 0) return;
  run(
    db,
    `INSERT INTO gateway_prompts (id, version, name, purpose, status, output_schema_json)
     VALUES (?, ?, 'Chart draft', 'clinical-generation', 'disabled', ?)`,
    GATEWAY_PROMPT.id,
    GATEWAY_PROMPT.version,
    OUTPUT_SCHEMA,
  );
  run(
    db,
    `INSERT INTO gateway_models (id, version, provider, status) VALUES (?, ?, 'unconfigured', 'disabled')`,
    GATEWAY_MODEL.id,
    GATEWAY_MODEL.version,
  );
  for (const organizationId of ["org_harborlight", "org_northwind"]) {
    run(db, `INSERT INTO gateway_quotas (organization_id, token_budget, tokens_used) VALUES (?, 0, 0)`, organizationId);
  }
}

export function ensureGatewayPolicy(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM gateway_prompts");
  if ((existing?.c ?? 0) > 0) return;
  transaction(db, () => seedGatewayRecords(db));
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function cleanInput(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 1 || trimmed.length > 2000) throw new ValidationError("invalid", "The gateway input must be 1–2000 characters.");
  return trimmed;
}

type Decision = {
  outcome: GatewayResult["outcome"] | "call";
  reason: string;
  modelId: string;
  modelVersion: string;
  estimate: number;
};

function decide(db: AppDatabase, ctx: SessionContext, prompt: PromptRow, adapter?: GatewayAdapter): Decision {
  if (prompt.status !== "active" || prompt.purpose === "clinical-generation") {
    return { outcome: "refused", reason: "policy", modelId: GATEWAY_MODEL.id, modelVersion: GATEWAY_MODEL.version, estimate: 0 };
  }
  const active = all<ModelRow>(db, `SELECT id, version, provider, status FROM gateway_models WHERE status = 'active'`);
  const match = adapter ? active.find((item) => item.id === adapter.modelId && item.version === adapter.modelVersion && item.provider === adapter.provider) : undefined;
  if (!match) {
    return { outcome: "refused", reason: "no-model", modelId: GATEWAY_MODEL.id, modelVersion: GATEWAY_MODEL.version, estimate: 0 };
  }
  const quota = get<{ token_budget: number; tokens_used: number }>(
    db,
    `SELECT token_budget, tokens_used FROM gateway_quotas WHERE organization_id = ?`,
    ctx.organizationId,
  );
  const budget = quota?.token_budget ?? 0;
  const used = quota?.tokens_used ?? 0;
  return { outcome: "call", reason: "route", modelId: match.id, modelVersion: match.version, estimate: Math.max(1, budget - used) };
}

export function invokeGateway(
  db: AppDatabase,
  ctx: SessionContext,
  input: { promptId: string; promptVersion: number; text: string; idempotencyKey: string },
  adapter?: GatewayAdapter,
): GatewayResult {
  assertKey(input.idempotencyKey);
  const text = cleanInput(input.text);
  const prompt = get<PromptRow>(
    db,
    `SELECT id, version, purpose, status, output_schema_json FROM gateway_prompts WHERE id = ? AND version = ?`,
    input.promptId,
    input.promptVersion,
  );
  if (!prompt) throw new ValidationError("invalid", "That prompt version is not registered.");
  const redaction = redactGatewayInput(text);
  const requestHash = canonicalHash({ promptId: prompt.id, promptVersion: prompt.version, inputHash: redaction.hash });
  return transaction(db, () => {
    const replay = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      input.idempotencyKey,
    );
    if (replay) {
      if (replay.request_hash !== requestHash) {
        throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      }
      return JSON.parse(replay.response_json) as GatewayResult;
    }
    const decision = decide(db, ctx, prompt, adapter);
    const traceId = `trc_${randomUUID()}`;
    let outcome: GatewayResult["outcome"] = decision.outcome === "call" ? "unavailable" : decision.outcome;
    let reason = decision.reason;
    let output: unknown | null = null;
    if (decision.outcome === "call" && adapter) {
      const quota = get<{ token_budget: number; tokens_used: number }>(
        db,
        `SELECT token_budget, tokens_used FROM gateway_quotas WHERE organization_id = ?`,
        ctx.organizationId,
      );
      const estimate = Math.max(1, Math.ceil(redaction.redacted.length / 4));
      if ((quota?.tokens_used ?? 0) + estimate > (quota?.token_budget ?? 0)) {
        outcome = "quota";
        reason = "budget";
      } else {
        try {
          const raw = adapter.invoke({ traceId, redactedInput: redaction.redacted });
          if (!validateStructuredOutput(prompt.output_schema_json, raw)) {
            outcome = "invalid-output";
            reason = "schema";
          } else {
            outcome = "accepted";
            reason = "schema";
            output = raw;
            run(
              db,
              `UPDATE gateway_quotas SET tokens_used = tokens_used + ? WHERE organization_id = ?`,
              estimate,
              ctx.organizationId,
            );
          }
        } catch {
          outcome = "unavailable";
          reason = "provider-down";
        }
      }
    }
    const now = new Date().toISOString();
    run(
      db,
      `INSERT INTO gateway_attempts (id, organization_id, facility_id, actor_id, prompt_id, prompt_version, model_id, model_version, outcome, reason, redacted, input_hash, output_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      traceId,
      ctx.organizationId,
      ctx.facilityId,
      ctx.userId,
      prompt.id,
      prompt.version,
      decision.modelId,
      decision.modelVersion,
      outcome,
      reason,
      redaction.changed ? 1 : 0,
      redaction.hash,
      output ? JSON.stringify(output) : null,
      now,
    );
    const result: GatewayResult = {
      traceId,
      outcome,
      reason,
      promptId: prompt.id,
      promptVersion: prompt.version,
      modelId: decision.modelId,
      modelVersion: decision.modelVersion,
      output,
    };
    run(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'gateway.attempt', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({
        traceId,
        outcome,
        promptId: prompt.id,
        promptVersion: prompt.version,
        modelId: decision.modelId,
        modelVersion: decision.modelVersion,
      }),
      now,
    );
    writeAudit(db, ctx, { action: "gateway.invoke", resourceType: "Gateway", resourceId: traceId, outcome: "success" });
    run(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(result),
      now,
    );
    return result;
  });
}

export function listGatewayAttempts(db: AppDatabase, ctx: SessionContext) {
  return all<{
    id: string;
    prompt_id: string;
    prompt_version: number;
    model_id: string;
    model_version: string;
    outcome: string;
    reason: string;
    created_at: string;
  }>(
    db,
    `SELECT id, prompt_id, prompt_version, model_id, model_version, outcome, reason, created_at
     FROM gateway_attempts WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50`,
    ctx.organizationId,
  ).map((row) => ({
    traceId: row.id,
    promptId: row.prompt_id,
    promptVersion: row.prompt_version,
    modelId: row.model_id,
    modelVersion: row.model_version,
    outcome: row.outcome,
    reason: row.reason,
    createdAt: row.created_at,
  }));
}

export function readGatewayAttempt(db: AppDatabase, ctx: SessionContext, traceId: string) {
  return listGatewayAttempts(db, ctx).find((item) => item.traceId === traceId) ?? null;
}

export function gatewayPolicy(db: AppDatabase, ctx: SessionContext) {
  const prompts = all<{ id: string; version: number; name: string; purpose: string; status: string }>(
    db,
    `SELECT id, version, name, purpose, status FROM gateway_prompts ORDER BY id`,
  );
  const models = all<{ id: string; version: string; provider: string; status: string }>(
    db,
    `SELECT id, version, provider, status FROM gateway_models ORDER BY id`,
  );
  const quota = get<{ token_budget: number; tokens_used: number }>(
    db,
    `SELECT token_budget, tokens_used FROM gateway_quotas WHERE organization_id = ?`,
    ctx.organizationId,
  );
  return {
    clinicalGeneration: false as const,
    prompts,
    models,
    quota: { tokenBudget: quota?.token_budget ?? 0, tokensUsed: quota?.tokens_used ?? 0 },
  };
}
