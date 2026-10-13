import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURES,
  ForbiddenError,
  GROUNDING_THRESHOLD,
  NotFoundError,
  askCopilot,
  createDatabase,
  openSession,
  readCopilot,
  readCopilotTurn,
  readSession,
  rebuildPatientState,
  recordCopilotFeedback,
  seed,
} from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

function counts(db: ReturnType<typeof createDatabase>) {
  const row = (sql: string) => (db.prepare(sql).get() as { c: number }).c;
  return {
    observations: row("SELECT COUNT(*) AS c FROM observations"),
    claims: row("SELECT COUNT(*) AS c FROM evidence_claims"),
    attempts: row("SELECT COUNT(*) AS c FROM gateway_attempts"),
  };
}

test("a fully supported chart is released and an invalidated claim blocks it", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  assert.equal(GROUNDING_THRESHOLD, 1);
  rebuildPatientState(db, ctx, FIXTURES.elena, "copilot-elena-01");
  const released = readCopilot(db, ctx, FIXTURES.elena);
  if (!released) throw new Error("copilot missing");
  assert.equal(released.released, true);
  assert.equal(released.groundingScore, 1);
  assert.equal(released.threshold, 1);
  const lines = [...released.summary, ...released.changed, ...released.abnormal, ...released.openItems];
  assert.ok(lines.length > 0);
  assert.ok(lines.every((line) => line.citations.length > 0));
  assert.equal(JSON.stringify(lines).includes("recommend"), false);
  assert.equal(JSON.stringify(lines).includes("should start"), false);
  assert.ok(released.abnormal.some((line) => line.citations.some((item) => item.sourceId === FIXTURES.obsPotassiumHigh)));
  assert.ok(released.changed.some((line) => line.citations.some((item) => item.sourceId === FIXTURES.obsPotassiumHigh)) || released.abnormal.length > 0);
  db.prepare("UPDATE observations SET value = 9.1 WHERE id = ?").run(FIXTURES.obsPotassiumHigh);
  const blocked = readCopilot(db, ctx, FIXTURES.elena);
  if (!blocked) throw new Error("copilot missing");
  assert.equal(blocked.released, false);
  assert.ok(blocked.groundingScore < 1);
  assert.equal(blocked.summary.length, 0);
  assert.equal(blocked.abnormal.length, 0);
  assert.ok(blocked.flagged.some((item) => item.reason === "invalidated"));
});

test("a question is answered only from supported claims", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  rebuildPatientState(db, ctx, FIXTURES.elena, "copilot-ask-01");
  const before = counts(db);
  const started = performance.now();
  const first = askCopilot(db, ctx, { patientId: FIXTURES.elena, question: "What potassium result is stored?", idempotencyKey: "copilot-ask-0001" });
  for (let i = 0; i < 40; i += 1) {
    const again = askCopilot(db, ctx, { patientId: FIXTURES.elena, question: "What potassium result is stored?", idempotencyKey: "copilot-ask-0001" });
    assert.equal(again.turnId, first.turnId);
  }
  assert.ok(performance.now() - started < 3000);
  assert.equal(first.outcome, "grounded");
  assert.equal(first.groundingScore, 1);
  assert.ok(first.lines.every((line) => line.text.toLowerCase().includes("potassium")));
  const claims = db.prepare("SELECT claim_text FROM evidence_claims").all() as { claim_text: string }[];
  for (const line of first.lines) assert.ok(claims.some((claim) => claim.claim_text === line.text));
  const stored = db.prepare("SELECT question_hash, answer_json FROM copilot_turns WHERE id = ?").get(first.turnId) as { question_hash: string; answer_json: string };
  assert.equal(stored.question_hash.includes("potassium"), false);
  const advice = askCopilot(db, ctx, { patientId: FIXTURES.elena, question: "should start insulin", idempotencyKey: "copilot-ask-0002" });
  assert.equal(advice.outcome, "blocked");
  assert.equal(advice.reason, "policy");
  assert.equal(advice.lines.length, 0);
  const adviceRow = db.prepare("SELECT answer_json FROM copilot_turns WHERE id = ?").get(advice.turnId) as { answer_json: string | null };
  assert.equal(adviceRow.answer_json, null);
  const vague = askCopilot(db, ctx, { patientId: FIXTURES.elena, question: "zebra habitat", idempotencyKey: "copilot-ask-0003" });
  assert.equal(vague.outcome, "blocked");
  assert.equal(vague.reason, "unsupported");
  const scoped = askCopilot(db, ctx, { patientId: FIXTURES.elena, question: "Compare with pat_samir", idempotencyKey: "copilot-ask-0004" });
  assert.equal(scoped.reason, "scope");
  assert.equal(counts(db).observations, before.observations);
  assert.equal(counts(db).claims, before.claims);
  assert.equal(counts(db).attempts, before.attempts);
  const claim = db.prepare("SELECT id, claim_text, evidence_state FROM evidence_claims WHERE patient_id = ? LIMIT 1").get(FIXTURES.elena) as {
    id: string;
    claim_text: string;
    evidence_state: string;
  };
  const feedback = recordCopilotFeedback(db, ctx, { patientId: FIXTURES.elena, claimId: claim.id, rating: "helpful", idempotencyKey: "copilot-note-0001" });
  const replay = recordCopilotFeedback(db, ctx, { patientId: FIXTURES.elena, claimId: claim.id, rating: "helpful", idempotencyKey: "copilot-note-0001" });
  assert.equal(replay.feedbackId, feedback.feedbackId);
  const after = db.prepare("SELECT claim_text, evidence_state FROM evidence_claims WHERE id = ?").get(claim.id) as { claim_text: string; evidence_state: string };
  assert.equal(after.claim_text, claim.claim_text);
  assert.equal(after.evidence_state, claim.evidence_state);
  assert.equal(counts(db).observations, before.observations);
});

test("another organization cannot read the copilot", () => {
  const amira = signIn(FIXTURES.amira);
  rebuildPatientState(amira.db, amira.ctx, FIXTURES.elena, "copilot-iso-01");
  const turn = askCopilot(amira.db, amira.ctx, { patientId: FIXTURES.elena, question: "potassium", idempotencyKey: "copilot-iso-0001" });
  const evan = signIn(FIXTURES.evan);
  assert.equal(readCopilot(evan.db, evan.ctx, FIXTURES.elena), null);
  assert.equal(readCopilotTurn(amira.db, evan.ctx, turn.turnId), null);
  assert.throws(
    () => askCopilot(amira.db, evan.ctx, { patientId: FIXTURES.elena, question: "potassium", idempotencyKey: "copilot-iso-0002" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  const priya = signIn(FIXTURES.priya);
  assert.throws(() => readCopilot(priya.db, priya.ctx, FIXTURES.elena), (error: unknown) => error instanceof ForbiddenError);
});
