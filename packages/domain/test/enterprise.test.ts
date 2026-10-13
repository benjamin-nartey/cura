import assert from "node:assert/strict";
import test from "node:test";
import {
  ENTERPRISE_DRILL_NOTE,
  ENTERPRISE_MOVE_NOTE,
  ENTERPRISE_REGION,
  ENTERPRISE_RPO_NOTE,
  ENTERPRISE_RTO_NOTE,
  FIXTURES,
  ForbiddenError,
  ValidationError,
  createDatabase,
  explainEnterprise,
  holdEnterpriseText,
  moveTenant,
  openSession,
  readEnterprise,
  readSession,
  recordApiGrant,
  recordFederation,
  recordKeyStatus,
  recordRegionDrill,
  recordResidency,
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

test("the local pin stays in place, and a failover is not run", () => {
  const { db, ctx } = signIn(FIXTURES.admin);
  assert.throws(() => readEnterprise(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => readEnterprise(db, session(db, FIXTURES.evan)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(
    () => recordResidency(db, ctx, { region: "eu-central-1", idempotencyKey: "ent-reg-0001" }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
  const pinned = recordResidency(db, ctx, { region: ENTERPRISE_REGION, idempotencyKey: "ent-reg-0002" });
  assert.equal(pinned.region, "local-sqlite");
  assert.throws(
    () => recordFederation(db, ctx, { endpoint: "https://idp.example", idempotencyKey: "ent-sso-0001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.equal(recordFederation(db, ctx, { idempotencyKey: "ent-sso-0002" }).status, "not-connected");
  assert.throws(
    () => recordKeyStatus(db, ctx, { material: "a".repeat(40), idempotencyKey: "ent-key-0001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.equal(recordKeyStatus(db, ctx, { idempotencyKey: "ent-key-0002" }).status, "not-configured");
  const drill = recordRegionDrill(db, ctx, { idempotencyKey: "ent-drill-001" });
  assert.equal(drill.failover, "not-run");
      assert.equal(drill.schemaVersion, 26);
  assert.ok(drill.elapsedMs >= 0 && drill.elapsedMs < 5000);
  assert.throws(
    () => recordApiGrant(db, ctx, { label: "Local health", audience: "https://api.example", idempotencyKey: "ent-api-0001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  const grant = recordApiGrant(db, ctx, { label: "Local health", idempotencyKey: "ent-api-0002" });
  assert.equal(grant.status, "local-session");
  assert.throws(
    () => moveTenant(db, ctx, { targetRegion: "eu-central-1", idempotencyKey: "ent-move-001" }),
    (error: unknown) => error instanceof ValidationError && error.message === ENTERPRISE_MOVE_NOTE,
  );
  const explained = explainEnterprise(
    db,
    ctx,
    { idempotencyKey: "ent-exp-0001" },
    { provider: "local", modelId: "mdl_none", modelVersion: "0", invoke: () => ({ region: "eu-central-1" }) },
  );
  assert.equal(explained.aiOutcome, "refused");
  assert.equal(explained.unchanged, true);
  assert.equal(explained.text, holdEnterpriseText("No region was changed. Enterprise text is not written by a model.", "eu-central-1"));
  const view = readEnterprise(db, ctx);
  assert.equal(view.region, "local-sqlite");
  assert.equal(view.rpoNote, ENTERPRISE_RPO_NOTE);
  assert.equal(view.rtoNote, ENTERPRISE_RTO_NOTE);
  assert.equal(view.drills[0]?.note, ENTERPRISE_DRILL_NOTE);
  assert.equal(view.drills[0]?.failover, "not-run");
  assert.equal(view.federation?.status, "not-connected");
  assert.equal(view.key?.status, "not-configured");
  assert.equal(view.grants[0]?.scope, "health.read");
  assert.equal(JSON.stringify(view).includes("Elena"), false);
});
