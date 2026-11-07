import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit, noteDenial } from "./audit";
import { canonicalHash } from "./briefing";
import {AGENT_TOOLS,agentPatientIds,authorizeAgentPatient,parseAgentToolInput,readAgentChartSources} from "./agent-tools";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway } from "./gateway";
import { canReadChart } from "./session";
import {assertLocalHealthcareSandbox} from "./experimental-healthcare";

export const CHART_AGENT = { id: "agt_chart_review", version: 1 };

type ToolId = keyof typeof AGENT_TOOLS;
type RunStatus = "running" | "awaiting-approval" | "completed" | "refused" | "failed";

export type AgentRunView = {
  runId: string;
  canCancel: boolean;
  status: RunStatus;
  agentId: string;
  agentVersion: number;
  patientId: string;
  approvalId: string | null;
  approvalStatus: "pending" | "approved" | "declined" | "expired" | null;
  approvalExpiresAt: string | null;
  canDecideApproval: boolean;
  requestedBy: string | null;
  sourceIds: string[];
  createdAt: string;
  attempts: number;
  checkpoints: {toolId:string;status:string;recordedAt:string}[];
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
  owner: string;
  purpose: string;
  data_scope: string;
  approval_required: number;
};

function isToolId(value: string): value is ToolId {
  return Object.hasOwn(AGENT_TOOLS, value);
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

export function assertSandboxedTool(toolId: string, payload: Record<string, unknown>) {
  if (!isToolId(toolId)) throw new ValidationError("invalid", "That tool is not registered.");
  parseAgentToolInput(payload);
}

export function seedAgentRecords(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM agent_manifests");
  if ((existing?.c ?? 0) > 0) return;
  for (const [id, tool] of Object.entries(AGENT_TOOLS)) {
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
  const row = get<ManifestRow>(db,`
    SELECT id,version,status,allowed_actors_json,allowed_tools_json,model_policy,timeout_ms,max_attempts,
      owner,purpose,data_scope,approval_required
    FROM agent_manifests WHERE id=? AND version=?
  `,agentId,version);
  if (!row || row.status !== "active") throw new ValidationError("invalid", "That agent version is not registered.");

  const actors = parseManifestList(row.allowed_actors_json);
  const tools = parseManifestList(row.allowed_tools_json);
  const chartReview = row.purpose === "chart-review" && row.model_policy === "none"
    && row.approval_required === 1 && tools.length === 2
    && tools[0] === "tool_chart_sources" && tools[1] === "tool_propose_review";
  const gatewayProbe = row.id !== CHART_AGENT.id && row.purpose === "control" && row.model_policy === "gateway-only"
    && row.approval_required === 0 && tools.length === 1 && tools[0] === "tool_model_draft";
  if ((!chartReview && !gatewayProbe) || row.data_scope !== "facility-chart"
      || !/^[A-Za-z0-9_-]{1,80}$/.test(row.owner)
      || actors.length === 0 || actors.length > 2 || new Set(actors).size !== actors.length
      || actors.some(role => role !== "clinician" && role !== "nurse")
      || !Number.isSafeInteger(row.timeout_ms) || row.timeout_ms < 1 || row.timeout_ms > 30_000
      || !Number.isSafeInteger(row.max_attempts) || row.max_attempts < 1 || row.max_attempts > 3) {
    throw new ForbiddenError("forbidden", "The agent manifest exceeds its permitted policy.");
  }
  return {...row,actors,tools};
}

function parseManifestList(json: string): unknown[] {
  try {
    const value: unknown = JSON.parse(json);
    if (Array.isArray(value)) return value;
  } catch {
    // Reject malformed policy the same way as an unsupported policy.
  }
  throw new ForbiddenError("forbidden", "The agent manifest is invalid.");
}

function executionManifest(db: AppDatabase, ctx: SessionContext, agentId: string, version: number) {
  try {
    const policy = manifest(db,agentId,version);
    if (ctx.purposeOfUse !== "TREATMENT" || !policy.actors.includes(ctx.role)) throw new ForbiddenError();
    return policy;
  } catch (error) {
    if (error instanceof ForbiddenError) noteDenial(db,ctx,"agent.manifest","Agent",agentId);
    throw error;
  }
}

export function readChartAgentPolicy(db: AppDatabase, ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx)) return null;
  const policy = manifest(db,CHART_AGENT.id,CHART_AGENT.version);
  return {owner:policy.owner,version:policy.version,timeoutMs:policy.timeout_ms,
    maxAttempts:policy.max_attempts,canStart:ctx.purposeOfUse === "TREATMENT" && policy.actors.includes(ctx.role)};
}

function requireTool(db: AppDatabase, toolId: ToolId) {
  const row = get<{ permits_execution: number }>(db, `SELECT permits_execution FROM agent_tools WHERE id = ?`, toolId);
  const spec = AGENT_TOOLS[toolId];
  if (!row || row.permits_execution !== (spec.permitsExecution ? 1 : 0)) {
    throw new ValidationError("invalid", "That tool is not registered.");
  }
  return spec;
}

const APPROVAL_WINDOW_MS = 24 * 60 * 60 * 1000;

function approvalDeadline(createdAt:string) {
  const created = Date.parse(createdAt);
  return Number.isFinite(created) ? created + APPROVAL_WINDOW_MS : 0;
}

function expireAgentApproval(db:AppDatabase,ctx:SessionContext,run:RunRow) {
  if (run.status !== "awaiting-approval") return;
  const approval = get<{id:string;created_at:string}>(db,
    "SELECT id,created_at FROM agent_approvals WHERE run_id=? AND status='pending'",run.id);
  if (!approval || Date.now() < approvalDeadline(approval.created_at)) return;
  transaction(db,() => {
    const now = new Date().toISOString();
    const updated = execute(db,
      "UPDATE agent_approvals SET status='declined',decided_at=? WHERE id=? AND status='pending' AND decided_by IS NULL",now,approval.id);
    if (!updated.changes) return;
    execute(db,"UPDATE agent_runs SET status='refused',updated_at=? WHERE id=? AND status='awaiting-approval'",now,run.id);
    execute(db,"UPDATE agent_steps SET status='refused',output_json=? WHERE run_id=? AND tool_id='tool_propose_review' AND status='parked'",
      JSON.stringify({executed:false,decision:"expired"}),run.id);
    execute(db,"INSERT INTO outbox (id,organization_id,event_type,payload_json,created_at) VALUES (?,?,'agent.approval',?,?)",
      randomUUID(),run.organization_id,JSON.stringify({approvalId:approval.id,runId:run.id,status:"expired"}),now);
    writeAudit(db,ctx,{action:"agent.approval.expired",resourceType:"AgentApproval",resourceId:approval.id,outcome:"success"});
  });
}

function toView(db: AppDatabase, ctx: SessionContext, run: RunRow): AgentRunView {
  expireAgentApproval(db,ctx,run);
  run = reload(db,run.id);
  const approval = get<{ created_at:string; decided_by:string | null; id: string; status: "pending" | "approved" | "declined"; requested_by: string }>(
    db,
    `SELECT id, status, requested_by, created_at, decided_by FROM agent_approvals WHERE run_id = ? ORDER BY created_at DESC LIMIT 1`,
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
    canCancel: run.status === "running" && run.actor_id === ctx.userId,
    status: run.status,
    agentId: run.agent_id,
    agentVersion: run.agent_version,
    patientId: run.patient_id,
    approvalId: approval?.id ?? null,
    approvalStatus: approval?.status === "declined" && !approval.decided_by ? "expired" : approval?.status ?? null,
    approvalExpiresAt: approval ? new Date(approvalDeadline(approval.created_at)).toISOString() : null,
    canDecideApproval: run.status === "awaiting-approval" && approval?.status === "pending"
      && approval.requested_by !== ctx.userId && ctx.purposeOfUse === "TREATMENT"
      && (ctx.role === "clinician" || ctx.role === "nurse"),
    requestedBy: approval?.requested_by ?? null,
    sourceIds: parsed && agentPatientIds(db,ctx,run.patient_id).length > 0 ? parsed.sourceIds ?? [] : [],
    createdAt: run.created_at,
    attempts: run.attempt_count,
    checkpoints: all<{tool_id:string;status:string;created_at:string}>(db,
      "SELECT tool_id,status,created_at FROM agent_steps WHERE run_id=? AND organization_id=? ORDER BY step_index LIMIT 8",
      run.id,run.organization_id).map(step => ({toolId:step.tool_id,status:step.status,recordedAt:step.created_at})),
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

export function agentExecutionStopped(db:AppDatabase,ctx:SessionContext) {
  return get<{stopped:number}>(db,"SELECT stopped FROM agent_execution_controls WHERE organization_id=?",ctx.organizationId)?.stopped === 1;
}

export function setAgentExecutionStopped(db:AppDatabase,ctx:SessionContext,stopped:boolean) {
  assertLocalHealthcareSandbox();
  if (ctx.role !== "admin" || ctx.purposeOfUse !== "OPERATIONS" || ctx.facilityId !== null ||
      !get(db,`SELECT u.id FROM users u JOIN organizations o ON o.id=u.organization_id
        WHERE u.id=? AND u.organization_id=? AND u.role='admin' AND u.facility_id IS NULL
          AND u.account_status='active' AND o.status='active'`,ctx.userId,ctx.organizationId)) {
    noteDenial(db,ctx,"agent.execution.control","AgentExecution",null);
    throw new ForbiddenError();
  }
  transaction(db,() => {
    if (agentExecutionStopped(db,ctx) === stopped) return;
    execute(db,`INSERT INTO agent_execution_controls (organization_id,stopped) VALUES (?,?)
      ON CONFLICT(organization_id) DO UPDATE SET stopped=excluded.stopped`,ctx.organizationId,stopped ? 1 : 0);
    if (stopped) {
      const running = all<RunRow>(db,"SELECT * FROM agent_runs WHERE organization_id=? AND status='running'",ctx.organizationId);
      execute(db,"UPDATE agent_runs SET status='refused',updated_at=? WHERE organization_id=? AND status='running'",
        new Date().toISOString(),ctx.organizationId);
      for (const run of running) emit(db,ctx,run,"refused","agent.execution.stopped");
    }
    writeAudit(db,ctx,{action:stopped ? "agent.execution.disabled" : "agent.execution.enabled",
      resourceType:"AgentExecution",resourceId:ctx.organizationId,outcome:"success"});
  });
}

function applyNext(db: AppDatabase, ctx: SessionContext, run: RunRow) {
  const policy = executionManifest(db,ctx,run.agent_id,run.agent_version);
  const tools = policy.tools;
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
  if (typeof toolId !== "string" || !isToolId(toolId)) {
    noteDenial(db, ctx, "agent.tool", "AgentTool", null);
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
    let sources: ReturnType<typeof readAgentChartSources>;
    try {
      sources = readAgentChartSources(db,ctx,run.patient_id,Date.parse(run.created_at)+policy.timeout_ms);
    } catch (error) {
      if (!(error instanceof ForbiddenError || error instanceof NotFoundError)) throw error;
      sources = null;
    }
    if (!sources) {
      noteDenial(db,ctx,"agent.tool","AgentTool",toolId);
      transaction(db, () => {
        const now = new Date().toISOString();
        execute(db, `UPDATE agent_runs SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'running'`, now, run.id);
        emit(db, ctx, run, "failed", "agent.run");
      });
      return "stop" as const;
    }
    transaction(db, () => {
      const already = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM agent_steps WHERE run_id = ? AND tool_id = ?`, run.id, toolId);
      if ((already?.c ?? 0) > 0) return;
      insertStep(db, reload(db, run.id), toolId, "committed", sources);
      writeAudit(db,ctx,{action:"agent.tool",resourceType:"AgentTool",resourceId:toolId,outcome:"success"});
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
  if (run.actor_id !== ctx.userId) {
    noteDenial(db,ctx,"agent.run","AgentRun",runId);
    throw new ForbiddenError();
  }
  if (run.status !== "running") return toView(db, ctx, run);
  const policy = executionManifest(db,ctx,run.agent_id,run.agent_version);
  const age = Date.now() - Date.parse(run.created_at);
  if (Number.isFinite(age) && age > policy.timeout_ms) {
    transaction(db, () => {
      const now = new Date().toISOString();
      execute(db, `UPDATE agent_runs SET status = 'failed', updated_at = ? WHERE id = ? AND status = 'running'`, now, run.id);
      emit(db, ctx, run, "failed", "agent.run");
    });
    return toView(db, ctx, reload(db, run.id));
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
    return toView(db, ctx, reload(db, run.id));
  }
  for (let guard = 0; guard < 8; guard += 1) {
    const step = transaction(db, () => {
      const current = reload(db,run.id);
      return current.status === "running" ? applyNext(db,ctx,current) : "stop";
    });
    if (step === "stop") return toView(db, ctx, reload(db, run.id));
  }
  return toView(db, ctx, reload(db, run.id));
}

export function enqueueAgentRun(
  db: AppDatabase,
  ctx: SessionContext,
  input: { agentId: string; agentVersion: number; patientId: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  assertSandboxedTool("tool_chart_sources", { patientId: input.patientId });
  const facility = facilityId(ctx);
  executionManifest(db,ctx,input.agentId,input.agentVersion);
  try {
    authorizeAgentPatient(db,ctx,input.patientId);
  } catch (error) {
    noteDenial(db,ctx,"agent.run","Agent",input.agentId);
    throw error;
  }
  const requestHash = canonicalHash({ agentId: input.agentId, agentVersion: input.agentVersion, patientId: input.patientId });
  return transaction(db, () => {
    const replay = get<{actor_id:string;request_hash:string;response_json:string}>(db,
      "SELECT actor_id,request_hash,response_json FROM idempotency_keys WHERE organization_id=? AND idempotency_key=?",
      ctx.organizationId,input.idempotencyKey);
    if (replay) {
      if (replay.actor_id !== ctx.userId || replay.request_hash !== requestHash) {
        throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      }
      const stored = JSON.parse(replay.response_json) as {runId:string};
      return scopedRun(db,ctx,stored.runId).id;
    }
    if (agentExecutionStopped(db,ctx)) throw new ForbiddenError("forbidden","Agent execution is stopped.");
    const runId = `run_${randomUUID()}`;
    const now = new Date().toISOString();
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
    return runId;
  });
}

export function startAgentRun(db:AppDatabase,ctx:SessionContext,input:Parameters<typeof enqueueAgentRun>[2]) {
  return advance(db,ctx,enqueueAgentRun(db,ctx,input));
}

export function stopAgentExecution(db:AppDatabase,ctx:SessionContext,runId:string,reason:"cancelled"|"workflow-failed") {
  return transaction(db,() => {
    const current = scopedRun(db,ctx,runId);
    if (current.actor_id !== ctx.userId) throw new ForbiddenError();
    if (current.status !== "running") return;
    const status = reason === "cancelled" ? "refused" : "failed";
    execute(db,"UPDATE agent_runs SET status=?,updated_at=? WHERE id=?",status,new Date().toISOString(),runId);
    emit(db,ctx,current,status,`agent.execution.${reason}`);
  });
}

export function resumeAgentRun(db: AppDatabase, ctx: SessionContext, runId: string) {
  return advance(db, ctx, runId);
}

export function callAgentTool(
  db: AppDatabase,
  ctx: SessionContext,
  input: { runId: string; toolId: string; payload: Record<string, unknown>; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const current = scopedRun(db, ctx, input.runId);
  const policy = executionManifest(db,ctx,current.agent_id,current.agent_version);
  if (!policy.tools.includes(input.toolId)) {
    noteDenial(db, ctx, "agent.tool", "AgentTool", isToolId(input.toolId) ? input.toolId : null);
    throw new ForbiddenError("forbidden", "That tool is outside the agent manifest.");
  }
  try {
    assertSandboxedTool(input.toolId, input.payload);
  } catch (error) {
    noteDenial(db,ctx,"agent.tool","AgentTool",input.toolId);
    throw error;
  }
  if (typeof input.payload.patientId === "string" && input.payload.patientId !== current.patient_id) {
    noteDenial(db, ctx, "agent.tool", "AgentTool", input.toolId);
    throw new ForbiddenError();
  }
  const toolId = input.toolId as ToolId;
  requireTool(db,toolId);
  try {
    if (current.actor_id !== ctx.userId) throw new ForbiddenError();
    authorizeAgentPatient(db,ctx,current.patient_id);
  } catch (error) {
    noteDenial(db,ctx,"agent.tool","AgentTool",toolId);
    throw error;
  }
  const existing = get(db,"SELECT id FROM agent_steps WHERE run_id=? AND tool_id=?",current.id,toolId);
  if (!existing) {
    noteDenial(db,ctx,"agent.tool","AgentTool",toolId);
    throw new ForbiddenError("forbidden","This tool has no recorded step.");
  }
  writeAudit(db,ctx,{action:"agent.tool.inspect",resourceType:"AgentTool",resourceId:toolId,outcome:"success"});
  return toView(db,ctx,current);
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
  const run = scopedRun(db,ctx,approval.run_id);
  const policy = executionManifest(db,ctx,run.agent_id,run.agent_version);
  if (policy.approval_required !== 1) throw new ForbiddenError();
  expireAgentApproval(db,ctx,run);
  const requestHash = canonicalHash({ approvalId: input.approvalId, decision: input.decision });
  return transaction(db, () => {
    const replay = get<{ actor_id:string; request_hash:string }>(
      db,
      `SELECT actor_id, request_hash FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      input.idempotencyKey,
    );
    if (replay) {
      if (replay.actor_id !== ctx.userId || replay.request_hash !== requestHash) {
        throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      }
      return toView(db,ctx,run);
    }
    const current = get<{status:string;created_at:string}>(db,"SELECT status,created_at FROM agent_approvals WHERE id=?",input.approvalId);
    if (current?.status !== "pending" || reload(db,run.id).status !== "awaiting-approval" || Date.now() >= approvalDeadline(current.created_at)) throw new ConflictError("conflict", "That approval is already decided.");
    if (input.decision === "approved" && agentExecutionStopped(db,ctx)) {
      throw new ForbiddenError("forbidden","Agent execution is stopped. You can still decline this review.");
    }
    if (!get(db,"SELECT id FROM agent_steps WHERE run_id=? AND tool_id='tool_propose_review' AND status='parked'",run.id)) {
      throw new ConflictError("conflict","The review checkpoint is unavailable.");
    }
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
    const saved = toView(db, ctx, reload(db, approval.run_id));
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
  ).map((row) => toView(db, ctx, row));
}

export function listAgentApprovalInbox(db:AppDatabase,ctx:SessionContext) {
  const facility = facilityId(ctx);
  if (ctx.purposeOfUse !== "TREATMENT" || (ctx.role !== "clinician" && ctx.role !== "nurse")) return [];
  return all<RunRow>(db,`
    SELECT r.* FROM agent_runs r JOIN agent_approvals a ON a.run_id=r.id
    WHERE r.organization_id=? AND r.facility_id=? AND r.status='awaiting-approval'
      AND a.organization_id=r.organization_id AND a.facility_id=r.facility_id
      AND a.status='pending' AND a.requested_by<>?
      AND julianday(a.created_at)>julianday(?)
    ORDER BY a.created_at,a.id LIMIT 50
  `,ctx.organizationId,facility,ctx.userId,new Date(Date.now()-APPROVAL_WINDOW_MS).toISOString()).map(row => toView(db,ctx,row))
    .filter(row => row.canDecideApproval);
}

export function readAgentRun(db: AppDatabase, ctx: SessionContext, runId: string) {
  const facility = facilityId(ctx);
  const run = get<RunRow>(db, `SELECT * FROM agent_runs WHERE id = ?`, runId);
  if (!run || run.organization_id !== ctx.organizationId || run.facility_id !== facility) {
    if (run) noteDenial(db, ctx, "agent.run", "AgentRun", runId);
    return null;
  }
  return toView(db, ctx, run);
}
