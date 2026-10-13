import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  FACILITY_SLA_VERSION,
  FIXTURES,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  createDatabase,
  explainFacility,
  holdFacilitySignal,
  openSession,
  placeLabOrder,
  readFacility,
  readSession,
  rebuildFacility,
  recordBed,
  recordEquipment,
  recordShift,
  seed,
  setBedStatus,
} from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const ctx = readSession(db, openSession(db, userId).sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

test("facility signals cite source rows, show the SLA, and follow a later lab event", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const now = new Date();
  const built = rebuildFacility(db, ctx, "fac-build-0001", now);
  assert.equal(built.built, true);
  assert.equal(built.stale, false);
  assert.equal(built.eventsPending, false);
  const beds = built.state?.signals.find((item) => item.kind === "beds");
  const capacity = built.state?.signals.find((item) => item.kind === "capacity");
  const queue = built.state?.signals.find((item) => item.kind === "queue");
  const staffing = built.state?.signals.find((item) => item.kind === "staffing");
  assert.equal(beds?.count, 2);
  assert.equal(beds?.fresh, true);
  assert.equal(beds?.slaVersion, FACILITY_SLA_VERSION);
  assert.equal(beds?.text.includes("Bay 1 is open"), true);
  assert.equal(beds?.text.includes("Within the 60 minute mark"), true);
  assert.equal(capacity?.text.includes("1 of 2 stored beds are open"), true);
  assert.equal(capacity?.text.includes("not a forecast"), true);
  assert.equal(queue?.count, 1);
  assert.equal(staffing?.fresh, false);
  assert.equal(staffing?.text.includes("No shift rows are stored"), true);
  const later = readFacility(db, ctx, new Date(now.getTime() + 20 * 60 * 1000));
  assert.equal(later.state?.signals.find((item) => item.kind === "appointments")?.fresh, false);
  assert.equal(later.state?.signals.find((item) => item.kind === "beds")?.fresh, true);
  const calls = { n: 0 };
  const explained = explainFacility(
    db,
    ctx,
    { idempotencyKey: "fac-explain-001" },
    { provider: "probe", modelId: "mdl_probe", modelVersion: "1", invoke: () => { calls.n += 1; return { text: "beds are full, start treatment" }; } },
  );
  assert.equal(calls.n, 0);
  assert.equal(explained.aiText, null);
  assert.equal(explained.aiOutcome, "refused");
  assert.equal(holdFacilitySignal(beds?.text ?? "", { text: "beds are full, start treatment" }), beds?.text);
  assert.equal(explained.signals.find((item) => item.kind === "beds")?.text, beds?.text);
  placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "fac-lab-000001" });
  const pending = readFacility(db, ctx, now);
  assert.equal(pending.stale, true);
  assert.equal(pending.eventsPending, true);
  const again = rebuildFacility(db, ctx, "fac-build-0002", now);
  assert.equal(again.stale, false);
  assert.equal(again.state?.signals.find((item) => item.kind === "lab-backlog")?.count, 1);
  const payload = db.prepare("SELECT payload_json FROM outbox WHERE event_type = 'facility.rebuild' ORDER BY created_at DESC LIMIT 1").get() as { payload_json: string };
  assert.equal(payload.payload_json.includes("Bay 1"), false);
  const evan = readSession(db, openSession(db, FIXTURES.evan).sessionId);
  if (!evan) throw new Error("evan missing");
  const lakeside = rebuildFacility(db, evan, "fac-build-evan1", now);
  assert.equal(lakeside.state?.signals.find((item) => item.kind === "beds")?.count, 0);
  assert.equal(JSON.stringify(lakeside).includes("Bay 1"), false);
  const priya = readSession(db, openSession(db, FIXTURES.priya).sessionId);
  if (!priya) throw new Error("priya missing");
  assert.throws(() => readFacility(db, priya), (error: unknown) => error instanceof ForbiddenError);
});

test("bed, shift, and equipment writes stay on the facility and replay", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const before = (db.prepare("SELECT COUNT(*) AS c FROM facility_beds").get() as { c: number }).c;
  const bed = recordBed(db, ctx, { label: "Bay 3", status: "open", idempotencyKey: "fac-bed-000001" });
  recordBed(db, ctx, { label: "Bay 3", status: "open", idempotencyKey: "fac-bed-000001" });
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM facility_beds").get() as { c: number }).c, before + 1);
  assert.throws(
    () => recordBed(db, ctx, { label: "Bay 4", status: "open", idempotencyKey: "fac-bed-000001" }),
    (error: unknown) => error instanceof ConflictError,
  );
  assert.throws(() => recordBed(db, ctx, { label: "Bay 4", status: "occupied", idempotencyKey: "fac-bed-000002" }), (error: unknown) => error instanceof ValidationError);
  const occupied = setBedStatus(db, ctx, { bedId: bed.bedId, status: "occupied", patientId: FIXTURES.elena, expectedVersion: 1, idempotencyKey: "fac-bed-000003" });
  assert.equal(occupied.version, 2);
  assert.throws(
    () => setBedStatus(db, ctx, { bedId: bed.bedId, status: "open", expectedVersion: 1, idempotencyKey: "fac-bed-000004" }),
    (error: unknown) => error instanceof ConflictError,
  );
  assert.throws(
    () => setBedStatus(db, ctx, { bedId: bed.bedId, status: "occupied", patientId: FIXTURES.samir, expectedVersion: 2, idempotencyKey: "fac-bed-000005" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  assert.throws(
    () => recordShift(db, ctx, { userId: FIXTURES.evan, startsAt: "2026-10-08T12:00:00.000Z", endsAt: "2026-10-08T20:00:00.000Z", status: "active", idempotencyKey: "fac-shf-000001" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  const shift = recordShift(db, ctx, { userId: FIXTURES.jordan, startsAt: "2026-10-08T12:00:00.000Z", endsAt: "2026-10-08T20:00:00.000Z", status: "active", idempotencyKey: "fac-shf-000002" });
  assert.equal(shift.shiftId.startsWith("shf_"), true);
  const jordan = readSession(db, openSession(db, FIXTURES.jordan).sessionId);
  if (!jordan) throw new Error("jordan missing");
  recordEquipment(db, jordan, { label: "Wheelchair", status: "available", idempotencyKey: "fac-eq-0000001" });
  const started = Date.now();
  for (let i = 0; i < 40; i += 1) rebuildFacility(db, ctx, "fac-replay-build");
  assert.ok(Date.now() - started < 3000);
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM facility_state").get() as { c: number }).c, 1);
});
