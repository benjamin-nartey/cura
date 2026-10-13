import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  FIXTURES,
  GATEWAY_MODEL,
  GATEWAY_PROMPT,
  createDatabase,
  invokeGateway,
  listGatewayAttempts,
  openSession,
  readSession,
  redactGatewayInput,
  seed,
  validateStructuredOutput,
} from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

function enableProbe(db: ReturnType<typeof createDatabase>, budget: number) {
  const schema = db.prepare("SELECT output_schema_json AS s FROM gateway_prompts LIMIT 1").get() as { s: string };
  db.prepare(
    `INSERT INTO gateway_prompts (id, version, name, purpose, status, output_schema_json)
     VALUES ('prm_probe', 1, 'Probe', 'control-plane', 'active', ?)`,
  ).run(schema.s);
  db.prepare(`INSERT INTO gateway_models (id, version, provider, status) VALUES ('mdl_probe', '1', 'probe', 'active')`).run();
  db.prepare(`UPDATE gateway_quotas SET token_budget = ? WHERE organization_id = 'org_harborlight'`).run(budget);
}

const probeAdapter = (invoke: (input: { traceId: string; redactedInput: string }) => unknown) => ({
  provider: "probe",
  modelId: "mdl_probe",
  modelVersion: "1",
  invoke,
});

test("a clinical prompt is refused and no adapter is called", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  let called = 0;
  const redacted = redactGatewayInput("Review RIV-1001");
  assert.equal(redacted.redacted.includes("RIV-1001"), false);
  const first = invokeGateway(
    db,
    ctx,
    { promptId: GATEWAY_PROMPT.id, promptVersion: GATEWAY_PROMPT.version, text: "Review RIV-1001", idempotencyKey: "gw-clin-0001" },
    probeAdapter(() => {
      called += 1;
      return { citations: ["x"] };
    }),
  );
  const again = invokeGateway(db, ctx, {
    promptId: GATEWAY_PROMPT.id,
    promptVersion: GATEWAY_PROMPT.version,
    text: "Review RIV-1001",
    idempotencyKey: "gw-clin-0001",
  });
  assert.equal(called, 0);
  assert.equal(first.outcome, "refused");
  assert.equal(first.reason, "policy");
  assert.equal(first.output, null);
  assert.equal(first.modelId, GATEWAY_MODEL.id);
  assert.equal(first.modelVersion, GATEWAY_MODEL.version);
  assert.equal(again.traceId, first.traceId);
  const stored = db.prepare("SELECT input_hash, output_json FROM gateway_attempts WHERE id = ?").get(first.traceId) as {
    input_hash: string;
    output_json: string | null;
  };
  assert.equal(stored.input_hash, redacted.hash);
  assert.equal(stored.output_json, null);
  assert.notEqual(stored.input_hash, createHash("sha256").update("Review RIV-1001").digest("hex"));
});

test("quota, outage, and schema failure store no generated text", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const before = db.prepare("SELECT COUNT(*) AS c FROM evidence_claims").get() as { c: number };
  enableProbe(db, 0);
  let called = 0;
  const blocked = invokeGateway(
    db,
    ctx,
    { promptId: "prm_probe", promptVersion: 1, text: "ping", idempotencyKey: "gw-quota-001" },
    probeAdapter(() => {
      called += 1;
      return { citations: ["obs"] };
    }),
  );
  assert.equal(blocked.outcome, "quota");
  assert.equal(called, 0);
  db.prepare(`UPDATE gateway_quotas SET token_budget = 100 WHERE organization_id = 'org_harborlight'`).run();
  const down = invokeGateway(
    db,
    ctx,
    { promptId: "prm_probe", promptVersion: 1, text: "ping", idempotencyKey: "gw-down-0001" },
    probeAdapter(() => {
      throw new Error("provider down");
    }),
  );
  assert.equal(down.outcome, "unavailable");
  assert.equal(down.output, null);
  assert.equal(down.modelVersion, "1");
  const invalid = invokeGateway(
    db,
    ctx,
    { promptId: "prm_probe", promptVersion: 1, text: "ping", idempotencyKey: "gw-bad-00001" },
    probeAdapter(() => ({ text: "should start insulin" })),
  );
  assert.equal(invalid.outcome, "invalid-output");
  assert.equal(invalid.output, null);
  const accepted = invokeGateway(
    db,
    ctx,
    { promptId: "prm_probe", promptVersion: 1, text: "ping", idempotencyKey: "gw-ok-000001" },
    probeAdapter(() => ({ citations: ["obs_elena_k_high"] })),
  );
  assert.equal(accepted.outcome, "accepted");
  assert.equal(validateStructuredOutput(JSON.stringify({ required: ["citations"], citationsMin: 1 }), accepted.output), true);
  const after = db.prepare("SELECT COUNT(*) AS c FROM evidence_claims").get() as { c: number };
  assert.equal(after.c, before.c);
  const leaked = db.prepare("SELECT COUNT(*) AS c FROM gateway_attempts WHERE output_json LIKE '%insulin%'").get() as { c: number };
  assert.equal(leaked.c, 0);
});

test("attempts stay inside the organization", () => {
  const amira = signIn(FIXTURES.amira);
  const filed = invokeGateway(amira.db, amira.ctx, {
    promptId: GATEWAY_PROMPT.id,
    promptVersion: GATEWAY_PROMPT.version,
    text: "status",
    idempotencyKey: "gw-org-00001",
  });
  const evanSession = openSession(amira.db, FIXTURES.evan);
  const evan = readSession(amira.db, evanSession.sessionId);
  if (!evan) throw new Error("session missing");
  assert.equal(listGatewayAttempts(amira.db, evan).some((item) => item.traceId === filed.traceId), false);
  const priyaSession = openSession(amira.db, FIXTURES.priya);
  const priya = readSession(amira.db, priyaSession.sessionId);
  if (!priya) throw new Error("session missing");
  assert.equal(listGatewayAttempts(amira.db, priya).some((item) => item.traceId === filed.traceId), true);
});
