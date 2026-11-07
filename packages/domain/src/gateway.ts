import { createHash, randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { ConflictError, ValidationError } from "./errors";
import { isVersionedProvider, type GatewayAdapter } from "./gateway-provider";
import { authorizeProviderDispatch } from "./gateway-policy";
import {dispatchWithBudget} from "./gateway-runtime";
import { gatewayReleaseLimits } from "./gateway-lifecycle";
export type { GatewayAdapter } from "./gateway-provider";

export const GATEWAY_PROMPT = { id: "prm_chart_draft", version: 1 };
export const GATEWAY_MODEL = { id: "mdl_none", version: "0" };

const OUTPUT_SCHEMA = JSON.stringify({ required: ["citations"], citationsMin: 1 });
const BLOCKED_OUTPUT = /recommend|diagnos|should start|likely has|prescrib|increase the dose/i;

type GatewayProvenance = {
  provider: string | null;
  latencyMs: number;
  estimatedInputUnits: number;
  citationReferences: string[];
  humanReviewRequired: true;
  limitation: "synthetic-unverified";
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
  fallback?: "manual-review";
  provenance?: GatewayProvenance;
  dispatchPolicyVersion?: 1;
  dispatchApprovalHash?: string;
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
  outcome: "refused";
  reason: string;
  modelId: string;
  modelVersion: string;
} | {
  outcome: "call";
  reason: "route";
  modelId: string;
  modelVersion: string;
  input: string;
  approvalHash: string;
  limits: NonNullable<ReturnType<typeof gatewayReleaseLimits>>;
};

function refuse(reason: string): Decision {
  return {outcome: "refused", reason, modelId: GATEWAY_MODEL.id, modelVersion: GATEWAY_MODEL.version};
}

function decide(db: AppDatabase, ctx: SessionContext, prompt: PromptRow, text: string, adapter?: GatewayAdapter): Decision {
  if (prompt.status !== "active" || prompt.purpose === "clinical-generation") {
    return refuse("policy");
  }
  if (!adapter) return refuse("no-model");
  if (!isVersionedProvider(adapter)) return refuse("provider-contract");
  const match = get<ModelRow>(db,
    "SELECT id, version, provider, status FROM gateway_models WHERE id=? AND version=? AND provider=? AND status='active'",
    adapter.modelId, adapter.modelVersion, adapter.provider,
  );
  if (!match) return refuse("no-model");
  const authorization = authorizeProviderDispatch(db, ctx, prompt, adapter, text);
  if ("denial" in authorization) return refuse(authorization.denial);
  const limits = gatewayReleaseLimits(db,ctx,{
    promptId:prompt.id,promptVersion:prompt.version,modelId:match.id,modelVersion:match.version,
  });
  if (!limits) return refuse("release-not-approved");
  return {outcome: "call", reason: "route", modelId: match.id, modelVersion: match.version, limits, ...authorization};
}

function withinReleaseLimits(raw: unknown, limits: NonNullable<ReturnType<typeof gatewayReleaseLimits>>) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return false;
  const output = raw as Record<string, unknown>;
  return Array.isArray(output.citations) && output.citations.length <= limits.maxCitations
    && output.citations.every(reference => typeof reference === "string" && /^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,159}$/.test(reference))
    && (output.text === undefined || typeof output.text === "string" && output.text.length <= limits.maxOutputCharacters);
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
    const replay = get<{ actor_id: string; request_hash: string; response_json: string }>(
      db,
      `SELECT actor_id, request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      input.idempotencyKey,
    );
    let decision = decide(db, ctx, prompt, redaction.redacted, adapter);
    if (replay) {
      if (replay.actor_id !== ctx.userId || replay.request_hash !== requestHash) {
        throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      }
      const prior = JSON.parse(replay.response_json) as GatewayResult;
      const scopedAttempt = typeof prior.traceId === "string" && get(db,
        "SELECT id FROM gateway_attempts WHERE id=? AND organization_id=? AND facility_id IS ? AND actor_id=?",
        prior.traceId, ctx.organizationId, ctx.facilityId, ctx.userId,
      );
      if (!scopedAttempt) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      if (prior.outcome !== "accepted" && prior.output === null) return prior;
      if (decision.outcome === "call") {
        if (prior.dispatchPolicyVersion === 1 && prior.dispatchApprovalHash === decision.approvalHash
            && prior.modelId === decision.modelId && prior.modelVersion === decision.modelVersion) return prior;
        decision = refuse("receipt-policy");
      }
    }
    const started = performance.now();
    const traceId = `trc_${randomUUID()}`;
    let outcome: GatewayResult["outcome"] = decision.outcome === "call" ? "unavailable" : decision.outcome;
    let reason = decision.reason;
    let output: unknown | null = null;
    if (decision.outcome === "call" && adapter) {
      const dispatch = dispatchWithBudget(db,ctx.organizationId,adapter,{
        traceId,redactedInput:decision.input,promptId:prompt.id,promptVersion:prompt.version,
      });
      if (dispatch.outcome !== "response") {
        outcome = dispatch.outcome;
        reason = dispatch.reason;
      } else if (withinReleaseLimits(dispatch.output,decision.limits) && validateStructuredOutput(prompt.output_schema_json,dispatch.output)) {
        outcome = "accepted";
        reason = "schema";
        output = dispatch.output;
      } else {
        outcome = "invalid-output";
        reason = "schema";
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
    const provenance: GatewayProvenance = {
      provider: decision.outcome === "call" ? adapter?.provider ?? null : null,
      latencyMs: Math.round(performance.now() - started),
      estimatedInputUnits: get<{units:number}>(db,
        "SELECT COALESCE(SUM(units),0) AS units FROM gateway_dispatch_units WHERE trace_id=?",traceId)!.units,
      citationReferences: output ? (output as {citations:string[]}).citations : [],
      humanReviewRequired: true,
      limitation: "synthetic-unverified",
    };
    run(db,"INSERT INTO gateway_trace_metadata VALUES (?,?,?,?)",
      traceId,provenance.provider,provenance.latencyMs,JSON.stringify(provenance.citationReferences));
    const result: GatewayResult = {
      traceId,
      outcome,
      reason,
      promptId: prompt.id,
      promptVersion: prompt.version,
      modelId: decision.modelId,
      modelVersion: decision.modelVersion,
      output,
      provenance,
      ...(outcome === "unavailable" || outcome === "quota" || outcome === "invalid-output" ? {fallback:"manual-review" as const} : {}),
      ...(outcome === "accepted" && decision.outcome === "call" ? {
        dispatchPolicyVersion: 1 as const,
        dispatchApprovalHash: decision.approvalHash,
      } : {}),
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
    writeAudit(db, ctx, { action: "gateway.invoke", resourceType: "Gateway", resourceId: traceId, outcome: outcome === "refused" ? "denied" : "success" });
    if (!replay) run(
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

function gatewayAttempts(db: AppDatabase, ctx: SessionContext, traceId: string | null) {
  return all<{
    id: string;
    prompt_id: string;
    prompt_version: number;
    model_id: string;
    model_version: string;
    outcome: string;
    reason: string;
    created_at: string;
    provider: string | null;
    latency_ms: number | null;
    citations_json: string | null;
    units: number | null;
  }>(db,`
    SELECT a.id,a.prompt_id,a.prompt_version,a.model_id,a.model_version,a.outcome,a.reason,a.created_at,
      m.provider,m.latency_ms,m.citations_json,
      (SELECT SUM(d.units) FROM gateway_dispatch_units d WHERE d.trace_id=a.id) AS units
    FROM gateway_attempts a LEFT JOIN gateway_trace_metadata m ON m.trace_id=a.id
    WHERE a.organization_id=? AND (? IS NULL OR a.id=?)
      AND ((?=1 AND (? IS NULL OR a.facility_id IS ?)) OR (a.actor_id=? AND a.facility_id IS ?))
    ORDER BY a.created_at DESC,a.id DESC LIMIT 50
  `,ctx.organizationId,traceId,traceId,ctx.role === "admin" ? 1 : 0,
    ctx.facilityId,ctx.facilityId,ctx.userId,ctx.facilityId).map(row => ({
    traceId: row.id,
    promptId: row.prompt_id,
    promptVersion: row.prompt_version,
    modelId: row.model_id,
    modelVersion: row.model_version,
    outcome: row.outcome,
    reason: row.reason,
    createdAt: row.created_at,
    provider: row.provider,
    latencyMs: row.latency_ms,
    estimatedInputUnits: row.units ?? (row.latency_ms === null ? null : 0),
    citationReferences: row.citations_json ? JSON.parse(row.citations_json) as string[] : [],
    humanReviewRequired: true as const,
  }));
}

export function listGatewayAttempts(db: AppDatabase, ctx: SessionContext) {
  return gatewayAttempts(db,ctx,null);
}

export function readGatewayAttempt(db: AppDatabase, ctx: SessionContext, traceId: string) {
  return gatewayAttempts(db,ctx,traceId)[0] ?? null;
}

export function gatewayPolicy(db: AppDatabase, ctx: SessionContext) {
  const prompts = all<{ id: string; version: number; name: string; purpose: string; status: string }>(
    db,
    `SELECT id, version, name, purpose, status FROM gateway_prompts p
     WHERE NOT EXISTS (SELECT 1 FROM gateway_registry_versions r WHERE r.kind='prompt' AND r.id=p.id
       AND r.version=CAST(p.version AS TEXT) AND (r.organization_id<>? OR r.facility_id IS NOT ?))
     ORDER BY id`, ctx.organizationId,ctx.facilityId,
  );
  const models = all<{ id: string; version: string; provider: string; status: string }>(
    db,
    `SELECT id, version, provider, status FROM gateway_models m
     WHERE NOT EXISTS (SELECT 1 FROM gateway_registry_versions r WHERE r.kind='model' AND r.id=m.id
       AND r.version=m.version AND (r.organization_id<>? OR r.facility_id IS NOT ?))
     ORDER BY id`, ctx.organizationId,ctx.facilityId,
  );
  const quota = get<{ token_budget: number; tokens_used: number }>(
    db,
    `SELECT token_budget, tokens_used FROM gateway_quotas WHERE organization_id = ?`,
    ctx.organizationId,
  );
  const circuits = all<{provider:string;model_id:string;model_version:string;open_until:number}>(db,`
    SELECT c.provider,c.model_id,c.model_version,c.open_until FROM gateway_circuits c
    JOIN gateway_registry_versions r ON r.kind='model' AND r.id=c.model_id
      AND r.version=c.model_version AND r.organization_id=c.organization_id
    WHERE c.organization_id=? AND c.failures=3
      AND (r.facility_id IS ? OR ?=1)
    ORDER BY c.open_until DESC,c.model_id,c.model_version
  `,ctx.organizationId,ctx.facilityId,ctx.role === "admin" && ctx.facilityId === null ? 1 : 0);
  return {
    circuits,
    clinicalGeneration: false as const,
    prompts,
    models,
    quota: { tokenBudget: quota?.token_budget ?? 0, tokensUsed: quota?.tokens_used ?? 0 },
  };
}
