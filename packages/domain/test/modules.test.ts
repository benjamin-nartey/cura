import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  FIXTURES,
  ForbiddenError,
  MODULE_AI_NOTE,
  MODULE_CODES,
  MODULE_PLATFORM_NOTE,
  NotFoundError,
  ValidationError,
  approvePlatform,
  clearModule,
  createDatabase,
  explainModule,
  holdModuleText,
  moduleIntendedUse,
  moduleModelCard,
  modulePerformanceNote,
  openSession,
  readModules,
  readSession,
  recordModule,
  recordModulePerformance,
  recordModuleStudy,
  recordModuleValidation,
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

test("each module keeps its own card, and none is cleared", () => {
  const { db, ctx } = signIn(FIXTURES.priya);
  const nabil = session(db, FIXTURES.nabil);
  assert.throws(() => readModules(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => readModules(db, session(db, FIXTURES.admin)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => readModules(db, session(db, FIXTURES.evan)), (error: unknown) => error instanceof ForbiddenError);
  const started = Date.now();
  assert.throws(
    () => recordModule(db, ctx, { code: "imaging", payload: "x".repeat(1025), idempotencyKey: "mod-big-0001" }),
    (error: unknown) => error instanceof ValidationError && error.code === "range",
  );
  assert.ok(Date.now() - started < 1000);
  assert.equal(readModules(db, ctx).modules.length, 0);
  assert.throws(() => recordModule(db, ctx, { code: "all", idempotencyKey: "mod-all-0001" }), (error: unknown) => error instanceof ValidationError && error.code === "code");
  assert.throws(
    () => recordModule(db, ctx, { code: "imaging", payload: "pixel-bytes", idempotencyKey: "mod-pix-0001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.throws(
    () => recordModule(db, ctx, { code: "imaging", intendedUse: "Detect cancer.", idempotencyKey: "mod-use-0001" }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
  const stored = MODULE_CODES.map((code, index) => recordModule(db, ctx, { code, idempotencyKey: `mod-reg-${index}1` }));
  assert.equal(stored.length, 7);
  assert.equal(new Set(stored.map((item) => item.code)).size, 7);
  assert.equal(stored.every((item) => item.status === "not-cleared"), true);
  assert.throws(
    () => recordModule(db, ctx, { code: "imaging", idempotencyKey: "mod-reg-dup1" }),
    (error: unknown) => error instanceof ConflictError,
  );
  const imaging = stored.find((item) => item.code === "imaging");
  if (!imaging) throw new Error("imaging missing");
  assert.throws(
    () => recordModuleValidation(db, ctx, { moduleId: imaging.moduleId, idempotencyKey: "mod-val-self" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  const validation = recordModuleValidation(db, nabil, { moduleId: imaging.moduleId, idempotencyKey: "mod-val-0001" }, { provider: "local", modelId: "mdl_none", modelVersion: "0", invoke: () => ({ finding: "normal" }) });
  assert.equal(validation.outcome, "refused");
  assert.throws(
    () => recordModuleStudy(db, ctx, { moduleId: imaging.moduleId, result: "workflow improved", idempotencyKey: "mod-stu-0001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.equal(recordModuleStudy(db, ctx, { moduleId: imaging.moduleId, idempotencyKey: "mod-stu-0002" }).status, "not-run");
  assert.throws(
    () => recordModulePerformance(db, ctx, { moduleId: imaging.moduleId, score: "0.91", subgroup: "age", site: "fac_riverside", idempotencyKey: "mod-prf-0001" }),
    (error: unknown) => error instanceof ValidationError && error.message === modulePerformanceNote("imaging"),
  );
  assert.equal(recordModulePerformance(db, ctx, { moduleId: imaging.moduleId, idempotencyKey: "mod-prf-0002" }).status, "not-calculated");
  const before = readModules(db, ctx).modules.map((item) => item.status);
  assert.throws(
    () => clearModule(db, nabil, { moduleId: imaging.moduleId, decision: "cleared", idempotencyKey: "mod-clr-0001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.throws(
    () => approvePlatform(db, ctx, { codes: [...MODULE_CODES], idempotencyKey: "mod-plt-0001" }),
    (error: unknown) => error instanceof ValidationError && error.message === MODULE_PLATFORM_NOTE,
  );
  assert.deepEqual(readModules(db, ctx).modules.map((item) => item.status), before);
  assert.throws(() => clearModule(db, nabil, { moduleId: "aim_missing", idempotencyKey: "mod-clr-0002" }), (error: unknown) => error instanceof NotFoundError);
  const explained = explainModule(db, ctx, { idempotencyKey: "mod-exp-0001" }, { provider: "local", modelId: "mdl_none", modelVersion: "0", invoke: () => ({ finding: "normal" }) });
  assert.equal(explained.aiOutcome, "refused");
  assert.equal(explained.unchanged, true);
  assert.equal(explained.text, holdModuleText(MODULE_AI_NOTE, { finding: "normal" }));
  const view = readModules(db, ctx);
  assert.equal(new Set(view.catalog.map((item) => item.intendedUse)).size, 7);
  assert.equal(new Set(view.catalog.map((item) => item.modelCard)).size, 7);
  assert.equal(view.catalog.find((item) => item.code === "ecg")?.intendedUse, moduleIntendedUse("ecg"));
  assert.equal(view.catalog.find((item) => item.code === "oncology")?.modelCard, moduleModelCard("oncology"));
  assert.notEqual(moduleIntendedUse("imaging"), moduleIntendedUse("oncology"));
  assert.equal(view.modules.every((item) => item.status === "not-cleared"), true);
  assert.equal(view.modules.find((item) => item.code === "imaging")?.validation, "refused");
  assert.equal(view.modules.find((item) => item.code === "imaging")?.study, "not-run");
  assert.equal(view.modules.find((item) => item.code === "imaging")?.performance, "not-calculated");
  assert.equal(view.platformNote, MODULE_PLATFORM_NOTE);
  assert.equal(JSON.stringify(view).includes("Elena"), false);
  assert.equal(JSON.stringify(view).includes("0.91"), false);
});
