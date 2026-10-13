import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import {
  CHART_AGENT,
  ConflictError,
  FIXTURES,
  ForbiddenError,
  NotFoundError,
  assertSandboxedTool,
  callAgentTool,
  createDatabase,
  decideAgentApproval,
  listAgentRuns,
  openSession,
  readAgentRun,
  readSession,
  resumeAgentRun,
  seed,
  startAgentRun,
} from "../src/index.ts";

function session(db: ReturnType<typeof createDatabase>, userId: string) {
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { ctx, sessionId: opened.sessionId };
}

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  return { db, ...session(db, userId) };
}

function counts(db: ReturnType<typeof createDatabase>) {
  const row = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  return {
    observations: row("SELECT COUNT(*) AS c FROM observations"),
    claims: row("SELECT COUNT(*) AS c FROM evidence_claims"),
    approvals: row("SELECT COUNT(*) AS c FROM agent_approvals"),
    attempts: row("SELECT COUNT(*) AS c FROM gateway_attempts"),
  };
}

test("a chart review parks for someone else and does not write the chart", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const before = counts(db);
  const started = performance.now();
  const first = startAgentRun(db, ctx, {
    agentId: CHART_AGENT.id,
    agentVersion: CHART_AGENT.version,
    patientId: FIXTURES.elena,
    idempotencyKey: "agt-review-0001",
  });
  for (let i = 0; i < 40; i += 1) {
    const again = startAgentRun(db, ctx, {
      agentId: CHART_AGENT.id,
      agentVersion: CHART_AGENT.version,
      patientId: FIXTURES.elena,
      idempotencyKey: "agt-review-0001",
    });
    assert.equal(again.runId, first.runId);
  }
  assert.ok(performance.now() - started < 3000);
  assert.equal(first.status, "awaiting-approval");
  assert.equal(first.approvalStatus, "pending");
  assert.equal(first.requestedBy, FIXTURES.amira);
  assert.ok(first.sourceIds.includes("obs_elena_k_high"));
  const after = counts(db);
  assert.equal(after.observations, before.observations);
  assert.equal(after.claims, before.claims);
  assert.equal(after.attempts, before.attempts);
  assert.equal(after.approvals, 1);
  const stored = db.prepare("SELECT output_json FROM agent_steps").all() as { output_json: string | null }[];
  const blob = stored.map((row) => row.output_json ?? "").join("\n");
  assert.equal(blob.includes("Elena"), false);
  assert.equal(blob.includes("5.4"), false);
  assert.equal(blob.includes("Furosemide"), false);
  assert.throws(
    () => decideAgentApproval(db, ctx, { approvalId: first.approvalId ?? "", decision: "approved", idempotencyKey: "agt-self-0001" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  assert.equal(counts(db).approvals, 1);
  const jordan = session(db, FIXTURES.jordan);
  const decided = decideAgentApproval(db, jordan.ctx, {
    approvalId: first.approvalId ?? "",
    decision: "approved",
    idempotencyKey: "agt-approve-0001",
  });
  const replay = decideAgentApproval(db, jordan.ctx, {
    approvalId: first.approvalId ?? "",
    decision: "approved",
    idempotencyKey: "agt-approve-0001",
  });
  assert.equal(replay.runId, decided.runId);
  assert.equal(decided.status, "completed");
  assert.equal(decided.approvalStatus, "approved");
  assert.throws(
    () => decideAgentApproval(db, jordan.ctx, { approvalId: first.approvalId ?? "", decision: "declined", idempotencyKey: "agt-approve-0002" }),
    (error: unknown) => error instanceof ConflictError,
  );
  const step = db.prepare("SELECT output_json FROM agent_steps WHERE tool_id = 'tool_propose_review'").get() as { output_json: string };
  assert.equal(JSON.parse(step.output_json).executed, false);
  assert.equal(counts(db).observations, before.observations);
});

test("a tool outside the manifest cannot run, and a write tool does not change the chart", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const run = startAgentRun(db, ctx, {
    agentId: CHART_AGENT.id,
    agentVersion: CHART_AGENT.version,
    patientId: FIXTURES.elena,
    idempotencyKey: "agt-tools-0001",
  });
  const before = counts(db);
  assert.throws(() => assertSandboxedTool("tool_shell", {}), (error: unknown) => error instanceof Error);
  assert.throws(
    () => callAgentTool(db, ctx, { runId: run.runId, toolId: "tool_chart_sources", payload: { patientId: "http://127.0.0.1/secret" }, idempotencyKey: "agt-tools-0002" }),
    (error: unknown) => error instanceof Error,
  );
  assert.throws(
    () => callAgentTool(db, ctx, { runId: run.runId, toolId: "tool_note_write", payload: {}, idempotencyKey: "agt-tools-0003" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  db.prepare("UPDATE agent_manifests SET allowed_tools_json = ? WHERE id = ?").run(
    JSON.stringify(["tool_chart_sources", "tool_propose_review", "tool_note_write"]),
    CHART_AGENT.id,
  );
  callAgentTool(db, ctx, { runId: run.runId, toolId: "tool_note_write", payload: {}, idempotencyKey: "agt-tools-0004" });
  callAgentTool(db, ctx, { runId: run.runId, toolId: "tool_note_write", payload: {}, idempotencyKey: "agt-tools-0004" });
  const steps = db.prepare("SELECT output_json FROM agent_steps WHERE tool_id = 'tool_note_write'").all() as { output_json: string }[];
  assert.equal(steps.length, 1);
  assert.equal(JSON.parse(steps[0]?.output_json ?? "{}").executed, false);
  assert.equal(counts(db).observations, before.observations);
  assert.equal(counts(db).approvals, before.approvals);
});

test("a crashed run resumes from the stored approval and survives a new connection", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cura-agent-"));
  const file = path.join(dir, "agent.sqlite");
  const db = createDatabase(file);
  seed(db);
  const amira = session(db, FIXTURES.amira);
  const jordan = session(db, FIXTURES.jordan);
  const started = startAgentRun(db, amira.ctx, {
    agentId: CHART_AGENT.id,
    agentVersion: CHART_AGENT.version,
    patientId: FIXTURES.elena,
    idempotencyKey: "agt-crash-0001",
  });
  db.prepare("DELETE FROM agent_approvals WHERE run_id = ?").run(started.runId);
  db.prepare("DELETE FROM agent_steps WHERE run_id = ? AND tool_id = 'tool_propose_review'").run(started.runId);
  db.prepare("UPDATE agent_runs SET status = 'running' WHERE id = ?").run(started.runId);
  const resumed = resumeAgentRun(db, amira.ctx, started.runId);
  const again = resumeAgentRun(db, amira.ctx, started.runId);
  assert.equal(resumed.status, "awaiting-approval");
  assert.equal(again.approvalId, resumed.approvalId);
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM agent_approvals").get() as { c: number }).c, 1);
  db.close();
  const reopened = createDatabase(file);
  const amiraAgain = readSession(reopened, amira.sessionId);
  const jordanAgain = readSession(reopened, jordan.sessionId);
  if (!amiraAgain || !jordanAgain) throw new Error("session missing after reopen");
  const pending = readAgentRun(reopened, amiraAgain, started.runId);
  assert.equal(pending?.approvalStatus, "pending");
  assert.equal(pending?.approvalId, resumed.approvalId);
  const observations = (reopened.prepare("SELECT COUNT(*) AS c FROM observations").get() as { c: number }).c;
  const decided = decideAgentApproval(reopened, jordanAgain, {
    approvalId: resumed.approvalId ?? "",
    decision: "declined",
    idempotencyKey: "agt-crash-0002",
  });
  assert.equal(decided.status, "refused");
  assert.equal((reopened.prepare("SELECT COUNT(*) AS c FROM observations").get() as { c: number }).c, observations);
  reopened.close();
  rmSync(dir, { recursive: true, force: true });
});

test("retries stop when the attempt budget is spent or the running step times out", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const budget = startAgentRun(db, ctx, {
    agentId: CHART_AGENT.id,
    agentVersion: CHART_AGENT.version,
    patientId: FIXTURES.elena,
    idempotencyKey: "agt-budget-0001",
  });
  db.prepare("DELETE FROM agent_approvals WHERE run_id = ?").run(budget.runId);
  db.prepare("DELETE FROM agent_steps WHERE run_id = ? AND tool_id = 'tool_propose_review'").run(budget.runId);
  db.prepare("UPDATE agent_runs SET status = 'running', attempt_count = 3 WHERE id = ?").run(budget.runId);
  assert.equal(resumeAgentRun(db, ctx, budget.runId).status, "failed");
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM agent_approvals WHERE run_id = ?").get(budget.runId) as { c: number }).c, 0);

  const timed = startAgentRun(db, ctx, {
    agentId: CHART_AGENT.id,
    agentVersion: CHART_AGENT.version,
    patientId: FIXTURES.elena,
    idempotencyKey: "agt-budget-0002",
  });
  db.prepare("DELETE FROM agent_approvals WHERE run_id = ?").run(timed.runId);
  db.prepare("DELETE FROM agent_steps WHERE run_id = ? AND tool_id = 'tool_propose_review'").run(timed.runId);
  db.prepare("UPDATE agent_runs SET status = 'running', created_at = '2020-01-01T00:00:00.000Z' WHERE id = ?").run(timed.runId);
  assert.equal(resumeAgentRun(db, ctx, timed.runId).status, "failed");
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM agent_approvals WHERE run_id = ?").get(timed.runId) as { c: number }).c, 0);
});

test("a model tool is refused by the gateway and another organization cannot see the run", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  db.prepare(
    `INSERT INTO agent_manifests (
       id, version, name, purpose, risk_class, status, allowed_actors_json, allowed_tools_json,
       data_scope, model_policy, approval_required, timeout_ms, max_attempts, evaluation_suite, owner
     ) VALUES ('agt_probe', 1, 'Probe', 'control', 'workflow-support', 'active', '["clinician"]', '["tool_model_draft"]', 'facility-chart', 'gateway-only', 0, 30000, 3, 'none', 'test')`,
  ).run();
  const before = counts(db);
  const probe = startAgentRun(db, ctx, {
    agentId: "agt_probe",
    agentVersion: 1,
    patientId: FIXTURES.elena,
    idempotencyKey: "agt-probe-0001",
  });
  assert.equal(probe.status, "completed");
  assert.equal(probe.approvalId, null);
  const step = db.prepare("SELECT output_json FROM agent_steps WHERE run_id = ?").get(probe.runId) as { output_json: string };
  const output = JSON.parse(step.output_json) as { outcome: string; traceId: string };
  assert.equal(output.outcome, "refused");
  assert.equal(output.traceId.startsWith("trc_"), true);
  assert.equal(step.output_json.includes("recommend"), false);
  const attempt = db.prepare("SELECT output_json FROM gateway_attempts WHERE id = ?").get(output.traceId) as { output_json: string | null };
  assert.equal(attempt.output_json, null);
  assert.equal(counts(db).attempts, before.attempts + 1);
  assert.equal(counts(db).observations, before.observations);
  assert.equal(counts(db).claims, before.claims);

  const evan = session(db, FIXTURES.evan);
  assert.equal(readAgentRun(db, evan.ctx, probe.runId), null);
  assert.equal(listAgentRuns(db, evan.ctx).some((item) => item.runId === probe.runId), false);
  assert.throws(
    () => startAgentRun(db, evan.ctx, { agentId: CHART_AGENT.id, agentVersion: CHART_AGENT.version, patientId: FIXTURES.elena, idempotencyKey: "agt-probe-0002" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  const priya = session(db, FIXTURES.priya);
  assert.throws(
    () => startAgentRun(db, priya.ctx, { agentId: CHART_AGENT.id, agentVersion: CHART_AGENT.version, patientId: FIXTURES.elena, idempotencyKey: "agt-probe-0003" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
});
