import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  FIXTURES,
  ForbiddenError,
  OPS_CONFIDENCE_VERSION,
  OPS_KPI_VERSION,
  ValidationError,
  createDatabase,
  createEncounter,
  explainOperations,
  holdOperationsText,
  openSession,
  overrideOperations,
  readOperations,
  readSession,
  rebuildOperations,
  recordInventory,
  recordShift,
  seed,
} from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const ctx = readSession(db, openSession(db, userId).sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

function session(db: ReturnType<typeof createDatabase>, userId: string) {
  const ctx = readSession(db, openSession(db, userId).sessionId);
  if (!ctx) throw new Error("session missing");
  return ctx;
}

test("operations sentences list factors and confidence, and a hold leaves the sentence", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const now = new Date("2026-10-08T18:00:00.000Z");
  const built = rebuildOperations(db, ctx, "ops-build-0001", now);
  assert.equal(built.built, true);
  assert.equal(built.stale, false);
  assert.equal(built.state?.recommendations.length, 5);
  assert.equal(built.state?.kpi.version, OPS_KPI_VERSION);
  assert.match(built.state?.kpi.text ?? "", /not a revenue or clinical outcome/);
  for (const item of built.state?.recommendations ?? []) {
    assert.equal(item.factors.length > 0, true);
    assert.equal(item.confidenceVersion, OPS_CONFIDENCE_VERSION);
    assert.equal(["none", "low", "stored"].includes(item.confidence), true);
  }
  const wait = built.state?.recommendations.find((item) => item.kind === "wait");
  assert.equal(wait?.factors.find((item) => item.name === "age at build in minutes")?.value, "1440");
  assert.match(wait?.text ?? "", /not a predicted wait/);
  assert.equal(wait?.confidence, "low");
  assert.match(built.state?.recommendations.find((item) => item.kind === "capacity")?.text ?? "", /not a forecast/);
  const inventory = built.state?.recommendations.find((item) => item.kind === "inventory");
  assert.match(inventory?.text ?? "", /not forecast/);
  assert.equal(inventory?.confidence, "none");
  const staffing = built.state?.recommendations.find((item) => item.kind === "staffing");
  assert.match(staffing?.text ?? "", /No staffing change is recommended/);
  const held = overrideOperations(db, ctx, {
    kind: "staffing",
    reason: "Held. This comparison is not an instruction.",
    idempotencyKey: "ops-hold-0001",
  });
  const replayed = overrideOperations(db, ctx, {
    kind: "staffing",
    reason: "Held. This comparison is not an instruction.",
    idempotencyKey: "ops-hold-0001",
  });
  assert.equal(replayed.overrideId, held.overrideId);
  const viewed = readOperations(db, ctx, now);
  const staffingNow = viewed.state?.recommendations.find((item) => item.kind === "staffing");
  assert.equal(staffingNow?.text, staffing?.text);
  assert.equal(staffingNow?.override?.action, "hold");
  assert.equal(viewed.stale, true);
  assert.throws(
    () => overrideOperations(db, ctx, { kind: "staffing", reason: "A different hold reason for the same key.", idempotencyKey: "ops-hold-0001" }),
    (error: unknown) => error instanceof ConflictError,
  );
  assert.throws(
    () => recordInventory(db, ctx, { label: "Gauze", onHand: -1, idempotencyKey: "ops-stock-bad1" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.throws(() => readOperations(db, session(db, FIXTURES.priya)), (error: unknown) => error instanceof ForbiddenError);
  assert.equal(holdOperationsText("Stored comparison.", { text: "hire three nurses" }), "Stored comparison.");
});

test("a later stored row changes the measured delta, and a model sentence is ignored", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const built = rebuildOperations(db, ctx, "ops-build-clock");
  assert.equal(built.state?.kpi.delta.labBacklog, 0);
  createEncounter(db, ctx, { patientId: FIXTURES.elena, reason: "Stored follow-up", idempotencyKey: "ops-enc-00001" });
  recordShift(db, ctx, {
    userId: FIXTURES.amira,
    startsAt: "2026-10-08T12:00:00.000Z",
    endsAt: "2026-10-08T20:00:00.000Z",
    status: "active",
    idempotencyKey: "ops-shift-0001",
  });
  const stock = recordInventory(db, ctx, { label: "Gauze", onHand: 4, idempotencyKey: "ops-stock-0001" });
  const replayed = recordInventory(db, ctx, { label: "Gauze", onHand: 4, idempotencyKey: "ops-stock-0001" });
  assert.equal(replayed.inventoryId, stock.inventoryId);
  const pending = readOperations(db, ctx);
  assert.equal(pending.stale, true);
  assert.equal(pending.eventsPending, true);
  const next = rebuildOperations(db, ctx, "ops-build-clock2");
  assert.equal(next.stale, false);
  assert.equal(next.state?.kpi.baseline.inventoryOnHand, 0);
  assert.equal(next.state?.kpi.delta.inventoryOnHand, 4);
  assert.equal(next.state?.kpi.delta.inProgressEncounters, 1);
  assert.equal(next.state?.kpi.delta.rosteredShifts, 1);
  assert.match(next.state?.kpi.text ?? "", /on-hand inventory 4/);
  assert.match(next.state?.recommendations.find((item) => item.kind === "staffing")?.text ?? "", /not an order to add staff/);
  assert.match(next.state?.recommendations.find((item) => item.kind === "inventory")?.text ?? "", /not forecast/);
  assert.match(next.state?.recommendations.find((item) => item.kind === "bottleneck")?.text ?? "", /not a detected flow constraint/);
  const calls = { n: 0 };
  const explained = explainOperations(
    db,
    ctx,
    { idempotencyKey: "ops-explain-01" },
    { provider: "probe", modelId: "mdl_probe", modelVersion: "1", invoke: () => { calls.n += 1; return { text: "hire three nurses" }; } },
  );
  assert.equal(calls.n, 0);
  assert.equal(explained.aiText, null);
  assert.equal(JSON.stringify(explained).includes("hire three nurses"), false);
  const evan = rebuildOperations(db, session(db, FIXTURES.evan), "ops-evan-00001");
  assert.equal(evan.facilityId, "fac_lakeside");
  assert.equal(JSON.stringify(evan).includes("Gauze"), false);
});
