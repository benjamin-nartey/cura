import { randomUUID } from "node:crypto";
import type { Chart, SessionContext } from "@curasphere/contracts";
import { writeAudit, noteDenial } from "./audit";
import { canonicalHash } from "./briefing";
import { getChart } from "./chart";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway } from "./gateway";
import { canReadChart } from "./session";

export const CHART_AGENT = { id: "agt_chart_review", version: 1 };

const LOCAL_TOOLS = {
  tool_chart_sources: { capability: "read", permitsExecution: true, effect: "read" },
  tool_propose_review: { capability: "draft", permitsExecution: false, effect: "approve" },
  tool_model_draft: { capability: "draft", permitsExecution: false, effect: "gateway" },
  tool_note_write: { capability: "draft", permitsExecution: false, effect: "draft-only" },
} as const;

type ToolId = keyof typeof LOCAL_TOOLS;
type RunStatus = "running" | "awaiting-approval" | "completed" | "refused" | "failed";

export type AgentRunView = {
  runId: string;
  status: RunStatus;
  agentId: string;
  agentVersion: number;
  patientId: string;
  approvalId: string | null;
  approvalStatus: "pending" | "approved" | "declined" | null;
  requestedBy: string | null;
  sourceIds: string[];
  createdAt: string;
};

type RunRow = {
  id: string;
  organization_id: string;
  facility_id: string;
  actor_id: string;
  agent_id: string;
  agent_version: number;
  patient_id: string;
  status: RunStatus;
  attempt_count: number;
  idempotency_key: string;
  created_at: string;
  updated_at: string;
};

type ManifestRow = {
  id: string;
  version: number;
  status: string;
  allowed_actors_json: string;
  allowed_tools_json: string;
  model_policy: string;
  timeout_ms: number;
  max_attempts: number;
};

function isToolId(value: string): value is ToolId {
  return Object.hasOwn(LOCAL_TOOLS, value);
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

export function assertSandboxedTool(toolId: string, payload: Record<string, unknown>) {
  if (!isToolId(toolId)) throw new ValidationError("invalid", "That tool is not registered.");
  if ("organizationId" in payload || "facilityId" in payload || "database" in payload || "url" in payload) {
    throw new ValidationError("invalid", "That tool input is outside the local sandbox.");
  }
  if (/https?:|file:/i.test(JSON.stringify(payload))) {
    throw new ValidationError("invalid", "That tool input is outside the local sandbox.");
  }
}

export function seedAgentRecords(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM agent_manifests");
  if ((existing?.c ?? 0) > 0) return;
  for (const [id, tool] of Object.entries(LOCAL_TOOLS)) {
    execute(
      db,
      `INSERT INTO agent_tools (id, capability, permits_execution, sandbox) VALUES (?, ?, ?, 'local-typed')`,
      id,
      tool.capability,
      tool.permitsExecution ? 1 : 0,
    );
  }
  execute(
    db,
    `INSERT INTO agent_manifests (
       id, version, name, purpose, risk_class, status, allowed_actors_json, allowed_tools_json,
       data_scope, model_policy, approval_required, timeout_ms, max_attempts, evaluation_suite, owner
     ) VALUES (?, ?, 'Chart review', 'chart-review', 'workflow-support', 'active', ?, ?, 'facility-chart', 'none', 1, 30000, 3, 'none', 'foundation')`,
    CHART_AGENT.id,
    CHART_AGENT.version,
    JSON.stringify(["clinician", "nurse"]),
    JSON.stringify(["tool_chart_sources", "tool_propose_review"]),
  );
}

export function ensureAgentPolicy(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM agent_manifests");
  if ((existing?.c ?? 0) > 0) return;
  transaction(db, () => seedAgentRecords(db));
}

function facilityId(ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx)) throw new ForbiddenError();
  return ctx.facilityId;
}

function manifest(db: AppDatabase, agentId: string, version: number) {
  const row = get<ManifestRow>(
    db,
    `SELECT id, version, status, allowed_actors_json, allowed_tools_json, model_policy, timeout_ms, max_attempts
     FROM agent_manifests WHERE id = ? AND version = ?`,
    agentId,
    version,
  );
  if (!row || row.status !== "active") throw new ValidationError("invalid", "That agent version is not registered.");
  return row;
}

function allowedTools(row: ManifestRow) {
  return JSON.parse(row.allowed_tools_json) as string[];
}

function requireTool(db: AppDatabase, toolId: ToolId) {
  const row = get<{ permits_execution: number }>(db, `SELECT permits_execution FROM agent_tools WHERE id = ?`, toolId);
  const spec = LOCAL_TOOLS[toolId];
  if (!row || row.permits_execution !== (spec.permitsExecution ? 1 : 0)) {
    throw new ValidationError("invalid", "That tool is not registered.");
  }
  return spec;
}

function sourceIds(chart: Chart) {
  return [
    ...chart.conditions.map((item) => item.id),
    ...chart.allergies.map((item) => item.id),
    ...chart.medications.map((item) => item.id),
    ...chart.observations.map((item) => item.id),
    ...chart.encounters.map((item) => item.id),
    ...chart.appointments.map((item) => item.id),
  ].sort();
}

function toView(db: AppDatabase, run: RunRow): AgentRunView {
  const approval = get<{ id: string; status: "pending" | "approved" | "declined"; requested_by: string }>(
    db,
    `SELECT id, status, requested_by FROM agent_approvals WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`,
    run.id,
  );
  const step = get<{ output_json: string | null }>(
    db,
    `SELECT output_json FROM agent_steps WHERE run_id = ? AND tool_id = 'tool_chart_sources' ORDER BY step_index LIMIT 1`,
    run.id,
  );
  const parsed = step?.output_json ? (JSON.parse(step.output_json) as { sourceIds?: string[] }) : null;
  return {
    runId: run.id,
    status: run.status,
    agentId: run.agent_id,
    agentVersion: run.agent_version,
    patientId: run.patient_id,
    approvalId: approval?.id ?? null,
    approvalStatus: approval?.status ?? null,
    requestedBy: approval?.requested_by ?? null,
    sourceIds: parsed?.sourceIds ?? [],
    createdAt: run.created_at,
  };
}

function reload(db: AppDatabase, runId: string) {
  const run = get<RunRow>(db, `SELECT * FROM agent_runs WHERE id = ?`, runId);
  if (!run) throw new NotFoundError();
  return run;
}

function scopedRun(db: AppDatabase, ctx: SessionContext, runId: string) {
  const facility = facilityId(ctx);
  const run = get<RunRow>(db, `SELECT * FROM agent_runs WHERE id = ?`, runId);
  if (!run) {
    writeAudit(db, ctx, { action: "agent.run", resourceType: "AgentRun", resourceId: runId, outcome: "not_found" });
    throw new NotFoundError();
  }
  if (run.organization_id !== ctx.organizationId || run.facility_id !== facility) {
    noteDenial(db, ctx, "agent.run", "AgentRun", runId);
    throw new NotFoundError();
  }
  return run;
}

function insertStep(
  db: AppDatabase,
  run: RunRow,
  toolId: string,
  status: "committed" | "parked" | "refused",
  output: unknown | null,
) {
  const count = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM agent_steps WHERE run_id = ?`, run.id);
  const now = new Date().toISOString();
  execute(
    db,
    `INSERT INTO agent_steps (id, run_id, organization_id, step_index, tool_id, status, input_hash, output_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `stp_${randomUUID()}`,
    run.id,
    run.organization_id,
    count?.c ?? 0,
    toolId,
    status,
    canonicalHash({ runId: run.id, toolId }),
    output === null ? null : JSON.stringify(output),
    now,
  );
}

function emit(db: AppDatabase, ctx: SessionContext, run: RunRow, status: RunStatus, action: string) {
  const now = new Date().toISOString();
  execute(
    db,
    `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'agent.run', ?, ?)`,
    randomUUID(),
    ctx.organizationId,
    JSON.stringify({ runId: run.id, agentId: run.agent_id, agentVersion: run.agent_version, status }),
    now,
  );
  writeAudit(db, ctx, { action, resourceType: "AgentRun", resourceId: run.id, outcome: "success" });
}

function gatewayKey(runId: string) {
  return `gw${runId.replace(/-/g, "")}`.slice(0, 40);
}

function applyNext(db: AppDatabase, ctx: SessionContext, run: RunRow) {
  const policy = manifest(db, run.agent_id, run.agent_version);
  const tools = allowedTools(policy);
  const count = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM agent_steps WHERE run_id = ?`, run.id);
  const index = count?.c ?? 0;
  if (index >= tools.length) {
    transaction(db, () => {
      const current = reload(db, run.id);
      if (current.status !== "running") return;
      const now = new Date().toISOString();
      execute(db, `UPDATE agent_runs SET status = 'completed', updated_at = ? WHERE id = ? AND status = 'running'`, now, run.id);
      emit(db, ctx, current, "completed", "agent.run");
    });
    return "stop" as const;
  }
  const toolId = tools[index] ?? "";
  if (!isToolId(toolId) || !tools.includes(toolId)) {
    noteDenial(db, ctx, "agent.tool", "AgentTool", toolId);
    throw new ForbiddenError("forbidden", "That tool is outside the agent manifest.");
  }
  const spec = requireTool(db, toolId);
  if (spec.effect === "gateway") {
    if (policy.model_policy !== "gateway-only") {
      noteDenial(db, ctx, "agent.tool", "AgentTool", toolId);
      throw new ForbiddenError("forbidden", "This agent cannot call a model.");
    }
    const result = invokeGateway(db, ctx, {
      promptId: GATEWAY_PROMPT.id,
      promptVersion: GATEWAY_PROMPT.version,
      text: "Review the listed source identifiers.",
      idempotencyKey: gatewayKey(run.id),
    });
    transaction(db, () => {
      const already = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM agent_steps WHERE run_id = ? AND tool_id = ?`, run.id, toolId);
      if ((already?.c ?? 0) > 0) return;
      insertStep(db, reload(db, run.id), toolId, "committed", {
        traceId: result.traceId,
        outcome: result.outcome,
        modelId: result.modelId,
        modelVersion: result.modelVersion,
      });
    });
    return "continue" as const;
  }
  if (spec.effect === "read") {
    const chart = getChart(db, ctx, run.patient_id);
    if (!chart) {
      transaction(db, () => {
        const now = new Date().toISOString();
        execute(db, `UPDATE agent_runs SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'running'`, now, run.id);
        emit(db, ctx, run, "failed", "agent.run");
      });
      return "stop" as const;
    }
    const ids = sourceIds(chart);
    transaction(db, () => {
      const already = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM agent_steps WHERE run_id = ? AND tool_id = ?`, run.id, toolId);
      if ((already?.c ?? 0) > 0) return;
      insertStep(db, reload(db, run.id), toolId, "committed", { sourceIds: ids });
    });
    return "continue" as const;
  }
  if (spec.effect === "approve") {
    transaction(db, () => {
      const already = get<{ id: string }>(db, `SELECT id FROM agent_approvals WHERE run_id = ? AND status = 'pending'`, run.id);
      if (already) return;
      const now = new Date().toISOString();
      const approvalId = `apr_${randomUUID()}`;
      execute(
        db,
        `INSERT INTO agent_approvals (id, run_id, organization_id, facility_id, tool_id, status, requested_by, decided_by, decided_at, created_at)
         VALUES (?, ?, ?, ?, ?, 'pending', ?, NULL, NULL, ?)`,
        approvalId,
        run.id,
        run.organization_id,
        run.facility_id,
        toolId,
        run.actor_id,
        now,
      );
      insertStep(db, reload(db, run.id), toolId, "parked", null);
      execute(db, `UPDATE agent_runs SET status = 'awaiting-approval', updated_at = ? WHERE id = ?`, now, run.id);
      execute(
        db,
        `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'agent.approval', ?, ?)`,
        randomUUID(),
        ctx.organizationId,
        JSON.stringify({ approvalId, runId: run.id, status: "pending" }),
        now,
      );
      writeAudit(db, ctx, { action: "agent.approval", resourceType: "AgentApproval", resourceId: approvalId, outcome: "success" });
    });
    return "stop" as const;
  }
  transaction(db, () => {
    const now = new Date().toISOString();
    insertStep(db, reload(db, run.id), toolId, "refused", { executed: false });
    execute(db, `UPDATE agent_runs SET status = 'refused', updated_at = ? WHERE id = ? AND status = 'running'`, now, run.id);
    emit(db, ctx, run, "refused", "agent.tool");
  });
  return "stop" as const;
}

function advance(db: AppDatabase, ctx: SessionContext, runId: string) {
  const run = scopedRun(db, ctx, runId);
  if (run.status !== "running") return toView(db, run);
  const policy = manifest(db, run.agent_id, run.agent_version);
  const age = Date.now() - Date.parse(run.created_at);
  if (Number.isFinite(age) && age > policy.timeout_ms) {
    transaction(db, () => {
      const now = new Date().toISOString();
      execute(db, `UPDATE agent_runs SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'running'`, now, run.id);
      emit(db, ctx, run, "failed", "agent.run");
    });
    return toView(db, reload(db, run.id));
  }
  transaction(db, () => {
    execute(
      db,
      `UPDATE agent_runs SET attempt_count = attempt_count + 1, updated_at = ? WHERE id = ? AND status = 'running'`,
      new Date().toISOString(),
      run.id,
    );
  });
  const bumped = reload(db, run.id);
  if (bumped.attempt_count > policy.max_attempts) {
    transaction(db, () => {
      const now = new Date().toISOString();
      execute(db, `UPDATE agent_runs SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'running'`, now, run.id);
      emit(db, ctx, bumped, "failed", "agent.run");
    });
    return toView(db, reload(db, run.id));
  }
  for (let guard = 0; guard < 8; guard += 1) {
    const current = reload(db, run.id);
    if (current.status !== "running") return toView(db, current);
    const step = applyNext(db, ctx, current);
    if (step === "stop") return toView(db, reload(db, run.id));
  }
  return toView(db, reload(db, run.id));
}

export function startAgentRun(
  db: AppDatabase,
  ctx: SessionContext,
  input: { agentId: string; agentVersion: number; patientId: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  assertSandboxedTool("tool_chart_sources", { patientId: input.patientId });
  const facility = facilityId(ctx);
  const policy = manifest(db, input.agentId, input.agentVersion);
  const actors = JSON.parse(policy.allowed_actors_json) as string[];
  if (!actors.includes(ctx.role)) {
    noteDenial(db, ctx, "agent.run", "Agent", input.agentId);
    throw new ForbiddenError();
  }
  const chart = getChart(db, ctx, input.patientId);
  if (!chart) throw new NotFoundError();
  const requestHash = canonicalHash({ agentId: input.agentId, agentVersion: input.agentVersion, patientId: input.patientId });
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
    const stored = JSON.parse(replay.response_json) as { runId: string };
    return advance(db, ctx, stored.runId);
  }
  const runId = `run_${randomUUID()}`;
  const now = new Date().toISOString();
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO agent_runs (
         id, organization_id, facility_id, actor_id, agent_id, agent_version, patient_id, status, attempt_count, idempotency_key, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, 'running', 0, ?, ?, ?)`,
      runId,
      ctx.organizationId,
      facility,
      ctx.userId,
      input.agentId,
      input.agentVersion,
      input.patientId,
      input.idempotencyKey,
      now,
      now,
    );
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify({ runId }),
      now,
    );
    writeAudit(db, ctx, { action: "agent.run", resourceType: "AgentRun", resourceId: runId, outcome: "success" });
  });
  return advance(db, ctx, runId);
}

export function resumeAgentRun(db: AppDatabase, ctx: SessionContext, runId: string) {
  scopedRun(db, ctx, runId);
  return advance(db, ctx, runId);
}

export function callAgentTool(
  db: AppDatabase,
  ctx: SessionContext,
  input: { runId: string; toolId: string; payload: Record<string, unknown>; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  assertSandboxedTool(input.toolId, input.payload);
  const current = scopedRun(db, ctx, input.runId);
  const policy = manifest(db, current.agent_id, current.agent_version);
  if (!allowedTools(policy).includes(input.toolId)) {
    noteDenial(db, ctx, "agent.tool", "AgentTool", input.toolId);
    throw new ForbiddenError("forbidden", "That tool is outside the agent manifest.");
  }
  if (typeof input.payload.patientId === "string" && input.payload.patientId !== current.patient_id) {
    noteDenial(db, ctx, "agent.tool", "AgentTool", input.toolId);
    throw new ForbiddenError();
  }
  const requestHash = canonicalHash({ runId: current.id, toolId: input.toolId });
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
    return JSON.parse(replay.response_json) as AgentRunView;
  }
  const toolId = input.toolId as ToolId;
  const spec = requireTool(db, toolId);
  if (spec.effect !== "draft-only") {
    const existing = get<{ id: string }>(db, `SELECT id FROM agent_steps WHERE run_id = ? AND tool_id = ?`, current.id, toolId);
    if (existing) return toView(db, current);
    throw new ForbiddenError("forbidden", "That tool is outside the agent manifest.");
  }
  const view = transaction(db, () => {
    insertStep(db, current, toolId, "refused", { executed: false });
    const now = new Date().toISOString();
    writeAudit(db, ctx, { action: "agent.tool", resourceType: "AgentTool", resourceId: toolId, outcome: "denied" });
    const saved = toView(db, reload(db, current.id));
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(saved),
      now,
    );
    return saved;
  });
  return view;
}

export function decideAgentApproval(
  db: AppDatabase,
  ctx: SessionContext,
  input: { approvalId: string; decision: "approved" | "declined"; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  if (input.decision !== "approved" && input.decision !== "declined") throw new ValidationError();
  const facility = facilityId(ctx);
  const approval = get<{
    id: string;
    run_id: string;
    organization_id: string;
    facility_id: string;
    status: string;
    requested_by: string;
  }>(db, `SELECT id, run_id, organization_id, facility_id, status, requested_by FROM agent_approvals WHERE id = ?`, input.approvalId);
  if (!approval) {
    writeAudit(db, ctx, { action: "agent.approval", resourceType: "AgentApproval", resourceId: input.approvalId, outcome: "not_found" });
    throw new NotFoundError();
  }
  if (approval.organization_id !== ctx.organizationId || approval.facility_id !== facility) {
    noteDenial(db, ctx, "agent.approval", "AgentApproval", input.approvalId);
    throw new NotFoundError();
  }
  if (approval.requested_by === ctx.userId) {
    noteDenial(db, ctx, "agent.approval", "AgentApproval", input.approvalId);
    throw new ForbiddenError("forbidden", "Another person at this facility has to decide.");
  }
  const requestHash = canonicalHash({ approvalId: input.approvalId, decision: input.decision });
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
      return JSON.parse(replay.response_json) as AgentRunView;
    }
    const current = get<{ status: string }>(db, `SELECT status FROM agent_approvals WHERE id = ?`, input.approvalId);
    if (current?.status !== "pending") throw new ConflictError("conflict", "That approval is already decided.");
    const now = new Date().toISOString();
    const approvalStatus = input.decision === "approved" ? "approved" : "declined";
    const runStatus: RunStatus = input.decision === "approved" ? "completed" : "refused";
    execute(
      db,
      `UPDATE agent_approvals SET status = ?, decided_by = ?, decided_at = ? WHERE id = ? AND status = 'pending'`,
      approvalStatus,
      ctx.userId,
      now,
      input.approvalId,
    );
    execute(db, `UPDATE agent_runs SET status = ?, updated_at = ? WHERE id = ?`, runStatus, now, approval.run_id);
    execute(
      db,
      `UPDATE agent_steps SET output_json = ?, status = 'committed' WHERE run_id = ? AND tool_id = 'tool_propose_review'`,
      JSON.stringify({ executed: false, decision: input.decision }),
      approval.run_id,
    );
    execute(
      db,
      `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'agent.approval', ?, ?)`,
      randomUUID(),
      ctx.organizationId,
      JSON.stringify({ approvalId: input.approvalId, runId: approval.run_id, status: approvalStatus }),
      now,
    );
    writeAudit(db, ctx, { action: "agent.approval", resourceType: "AgentApproval", resourceId: input.approvalId, outcome: "success" });
    const saved = toView(db, reload(db, approval.run_id));
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      input.idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(saved),
      now,
    );
    return saved;
  });
}

export function listAgentRuns(db: AppDatabase, ctx: SessionContext) {
  const facility = facilityId(ctx);
  return all<RunRow>(
    db,
    `SELECT * FROM agent_runs WHERE organization_id = ? AND facility_id = ? ORDER BY created_at DESC LIMIT 50`,
    ctx.organizationId,
    facility,
  ).map((row) => toView(db, row));
}

export function readAgentRun(db: AppDatabase, ctx: SessionContext, runId: string) {
  const facility = facilityId(ctx);
  const run = get<RunRow>(db, `SELECT * FROM agent_runs WHERE id = ?`, runId);
  if (!run || run.organization_id !== ctx.organizationId || run.facility_id !== facility) {
    if (run) noteDenial(db, ctx, "agent.run", "AgentRun", runId);
    return null;
  }
  return toView(db, run);
}
