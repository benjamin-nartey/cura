import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  FIXTURES,
  ForbiddenError,
  GATEWAY_MODEL,
  NotFoundError,
  RELEASE_AI_NOTE,
  RELEASE_ATTEMPT_NOTE,
  RELEASE_CLINICAL_NOTE,
  RELEASE_DOSSIER_NOTE,
  RELEASE_STRATEGY_NOTE,
  RELEASE_SURVEILLANCE_NOTE,
  RELEASE_TRACE_DOCS,
  ValidationError,
  createDatabase,
  explainReleaseTrain,
  holdReleaseText,
  openSession,
  readEvaluation,
  readReleaseTrain,
  readSession,
  recordChangePlan,
  recordClinicalEvaluation,
  recordDossier,
  recordReleaseAttempt,
  recordRiskFile,
  recordStrategy,
  recordSurveillance,
  recordTrace,
  recordValidation,
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

function session(db: ReturnType<typeof createDatabase>, userId: string) {
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return ctx;
}

test("a release attempt stays not-released, and the refusal gate stays disabled", () => {
  const { db, ctx } = signIn(FIXTURES.priya);
  const nabil = session(db, FIXTURES.nabil);
  assert.throws(() => readReleaseTrain(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => readReleaseTrain(db, session(db, FIXTURES.admin)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => readReleaseTrain(db, session(db, FIXTURES.evan)), (error: unknown) => error instanceof ForbiddenError);
  const started = Date.now();
  assert.throws(
    () => recordDossier(db, ctx, { strategyId: "rst_missing", label: "Refusal gate", claim: "x".repeat(1025), idempotencyKey: "rel-big-0001" }),
    (error: unknown) => error instanceof ValidationError && error.code === "range",
  );
  assert.ok(Date.now() - started < 1000);
  assert.equal(readReleaseTrain(db, ctx).dossiers.length, 0);
  assert.throws(
    () => recordStrategy(db, ctx, { jurisdiction: "FDA", idempotencyKey: "rel-jur-0001" }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
  assert.throws(
    () => recordStrategy(db, ctx, { jurisdiction: "local-synthetic", status: "approved", idempotencyKey: "rel-jur-0002" }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
  const strategy = recordStrategy(db, ctx, { jurisdiction: "local-synthetic", idempotencyKey: "rel-jur-0003" });
  assert.equal(strategy.status, "not-approved");
  assert.equal(recordStrategy(db, ctx, { jurisdiction: "local-synthetic", idempotencyKey: "rel-jur-0003" }).strategyId, strategy.strategyId);
  assert.throws(
    () => recordDossier(db, ctx, { strategyId: strategy.strategyId, label: "Elena gate", idempotencyKey: "rel-dos-0001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.throws(
    () => recordDossier(db, ctx, { strategyId: strategy.strategyId, label: "Refusal gate", claim: "Diagnose heart failure.", idempotencyKey: "rel-dos-0002" }),
    (error: unknown) => error instanceof ValidationError,
  );
  const dossier = recordDossier(db, ctx, { strategyId: strategy.strategyId, label: "Refusal gate", idempotencyKey: "rel-dos-0003" });
  assert.throws(
    () => recordReleaseAttempt(db, nabil, { dossierId: dossier.dossierId, idempotencyKey: "rel-try-0001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.equal(readReleaseTrain(db, ctx).attempts.length, 0);
  assert.throws(
    () => recordTrace(db, ctx, { dossierId: dossier.dossierId, certificate: "CERT-100", idempotencyKey: "rel-trace-01" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.equal(recordTrace(db, ctx, { dossierId: dossier.dossierId, idempotencyKey: "rel-trace-02" }).traceId.startsWith("rtr_"), true);
  assert.throws(
    () => recordTrace(db, ctx, { dossierId: dossier.dossierId, idempotencyKey: "rel-trace-03" }),
    (error: unknown) => error instanceof ConflictError,
  );
  assert.throws(
    () => recordRiskFile(db, ctx, { dossierId: dossier.dossierId, signed: "cleared", idempotencyKey: "rel-risk-001" }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
  assert.equal(recordRiskFile(db, ctx, { dossierId: dossier.dossierId, idempotencyKey: "rel-risk-002" }).status, "not-reviewed");
  const validation = recordValidation(db, ctx, { dossierId: dossier.dossierId, idempotencyKey: "rel-vv-0001" }, { provider: "local", modelId: "mdl_none", modelVersion: "0", invoke: () => ({ approved: true }) });
  assert.equal(validation.outcome, "refused");
  assert.throws(
    () => recordClinicalEvaluation(db, ctx, { dossierId: dossier.dossierId, result: "benefit shown", idempotencyKey: "rel-ce-0001" }),
    (error: unknown) => error instanceof ValidationError && error.message === RELEASE_CLINICAL_NOTE,
  );
  assert.equal(recordClinicalEvaluation(db, ctx, { dossierId: dossier.dossierId, idempotencyKey: "rel-ce-0002" }).status, "not-performed");
  assert.throws(
    () => recordChangePlan(db, ctx, { dossierId: dossier.dossierId, modelVersion: "9", idempotencyKey: "rel-pcp-001" }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
  assert.equal(recordChangePlan(db, ctx, { dossierId: dossier.dossierId, idempotencyKey: "rel-pcp-002" }).status, "not-authorized");
  const watch = recordSurveillance(db, ctx, { dossierId: dossier.dossierId, idempotencyKey: "rel-pms-001" });
  assert.equal(watch.status, "not-active");
  assert.ok(watch.refusalCount >= 1);
  assert.throws(
    () => recordReleaseAttempt(db, ctx, { dossierId: dossier.dossierId, idempotencyKey: "rel-try-0002" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  assert.throws(
    () => recordReleaseAttempt(db, nabil, { dossierId: dossier.dossierId, decision: "approved", idempotencyKey: "rel-try-0003" }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
  const attempt = recordReleaseAttempt(db, nabil, { dossierId: dossier.dossierId, idempotencyKey: "rel-try-0004" });
  assert.equal(attempt.outcome, "not-released");
  assert.throws(
    () => recordReleaseAttempt(db, nabil, { dossierId: "dos_missing", idempotencyKey: "rel-try-0005" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  const explained = explainReleaseTrain(db, ctx, { idempotencyKey: "rel-exp-0001" }, { provider: "local", modelId: "mdl_none", modelVersion: "0", invoke: () => ({ approved: true }) });
  assert.equal(explained.aiOutcome, "refused");
  assert.equal(explained.unchanged, true);
  assert.equal(explained.text, holdReleaseText(RELEASE_AI_NOTE, { approved: true }));
  const view = readReleaseTrain(db, ctx);
  assert.equal(view.strategyNote, RELEASE_STRATEGY_NOTE);
  assert.equal(view.dossierNote, RELEASE_DOSSIER_NOTE);
  assert.deepEqual(view.traceDocs, RELEASE_TRACE_DOCS);
  assert.equal(view.surveillanceNote, RELEASE_SURVEILLANCE_NOTE);
  assert.equal(view.attemptNote, RELEASE_ATTEMPT_NOTE);
  assert.equal(view.strategies[0]?.status, "not-approved");
  assert.equal(view.dossiers[0]?.validation, "refused");
  assert.equal(view.dossiers[0]?.surveillance?.status, "not-active");
  assert.equal(view.attempts[0]?.outcome, "not-released");
  assert.equal(readEvaluation(db, ctx).runs.length, 0);
  assert.equal(GATEWAY_MODEL.version, "0");
  assert.equal(JSON.stringify(view).includes("Elena"), false);
});
