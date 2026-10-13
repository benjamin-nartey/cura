import assert from "node:assert/strict";
import test from "node:test";
import {
  EVAL_DRIFT_NOTE,
  EVAL_HOLD_NOTE,
  EVAL_MODEL_CARD,
  EVAL_SUBGROUP_NOTE,
  FIXTURES,
  ForbiddenError,
  ValidationError,
  createDatabase,
  holdEvalText,
  openSession,
  readEvaluation,
  readSession,
  recordEvalPromotion,
  registerEvalDataset,
  requestEvalApproval,
  runEvaluation,
  seed,
  signEvalApproval,
} from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

function session(db: ReturnType<typeof createDatabase>, userId: string) {
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return ctx;
}

test("a refusal suite can be signed as a hold, and the model stays disabled", () => {
  const { db, ctx } = signIn(FIXTURES.priya);
  const nabil = session(db, FIXTURES.nabil);
  assert.throws(() => readEvaluation(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => readEvaluation(db, session(db, FIXTURES.evan)), (error: unknown) => error instanceof ForbiddenError);
  const registered = registerEvalDataset(db, ctx, { idempotencyKey: "eval-set-0001" });
  const again = registerEvalDataset(db, ctx, { idempotencyKey: "eval-set-0002" });
  assert.equal(again.datasetId, registered.datasetId);
  assert.equal(again.version, 1);
  const first = runEvaluation(
    db,
    ctx,
    { datasetId: registered.datasetId, idempotencyKey: "eval-run-0001" },
    { provider: "local", modelId: "mdl_none", modelVersion: "0", invoke: () => ({ promoted: true }) },
  );
  const second = runEvaluation(db, ctx, { datasetId: registered.datasetId, idempotencyKey: "eval-run-0002" });
  assert.equal(first.outcome, "passed");
  assert.equal(second.outcome, "passed");
  const view = readEvaluation(db, ctx);
  assert.equal(view.modelCard, holdEvalText(EVAL_MODEL_CARD, "promoted"));
  assert.equal(view.subgroupNote, EVAL_SUBGROUP_NOTE);
  assert.equal(view.driftNote, EVAL_DRIFT_NOTE);
  assert.equal(view.runs[0]?.cases.every((item) => item.actual === "refused" && item.matched), true);
  assert.deepEqual(view.runs[0]?.cases, view.runs[1]?.cases);
  assert.equal(view.runs[0]?.rollback.status, "disabled");
  assert.equal(view.runs[0]?.rollback.modelId, "mdl_none");
  const requested = requestEvalApproval(db, ctx, { runId: first.runId, idempotencyKey: "eval-ask-0001" });
  assert.throws(
    () => signEvalApproval(db, ctx, { approvalId: requested.approvalId, idempotencyKey: "eval-sign-0001" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  assert.throws(
    () => recordEvalPromotion(db, ctx, { runId: first.runId, idempotencyKey: "eval-pro-0001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  const signed = signEvalApproval(db, nabil, { approvalId: requested.approvalId, idempotencyKey: "eval-sign-0002" });
  assert.equal(signed.decision, "hold");
  const promoted = recordEvalPromotion(db, nabil, { runId: first.runId, idempotencyKey: "eval-pro-0002" });
  assert.equal(promoted.outcome, "not-promoted");
  const after = readEvaluation(db, nabil);
  assert.equal(after.approvals[0]?.decision, "hold");
  assert.equal(after.holdNote, EVAL_HOLD_NOTE);
  assert.equal(after.promotions[0]?.outcome, "not-promoted");
  assert.equal(after.runs[0]?.rollback.status, "disabled");
  const encoded = JSON.stringify(after);
  assert.equal(encoded.includes("Elena"), false);
  assert.equal(encoded.includes("pat_elena"), false);
});
