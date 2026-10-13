import assert from "node:assert/strict";
import test from "node:test";
import { FIXTURES, createDatabase, getChart, listPatients, openSession, readSession, seed } from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

function lastOutcome(db: ReturnType<typeof createDatabase>, action: string, resourceId: string) {
  return db
    .prepare(
      `SELECT outcome FROM audit_events WHERE action = ? AND resource_id = ? ORDER BY created_at DESC LIMIT 1`,
    )
    .get(action, resourceId) as { outcome: string };
}

test("a riverside clinician cannot read another organization or another facility", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  assert.equal(getChart(db, ctx, FIXTURES.samir), null);
  assert.equal(lastOutcome(db, "patient.read", FIXTURES.samir).outcome, "denied");
  assert.equal(getChart(db, ctx, FIXTURES.noor), null);
  assert.equal(lastOutcome(db, "patient.read", FIXTURES.noor).outcome, "denied");
  assert.equal(getChart(db, ctx, "pat_missing"), null);
  assert.equal(lastOutcome(db, "patient.read", "pat_missing").outcome, "not_found");
  const names = listPatients(db, ctx).map((patient) => patient.id);
  assert.deepEqual(names.sort(), [FIXTURES.elena, FIXTURES.helen, FIXTURES.mateo].sort());
});

test("east annex and northwind see only their own facility", () => {
  const east = signIn(FIXTURES.lea);
  assert.deepEqual(listPatients(east.db, east.ctx).map((patient) => patient.id), [FIXTURES.noor]);
  const north = signIn(FIXTURES.evan);
  assert.deepEqual(listPatients(north.db, north.ctx).map((patient) => patient.id), [FIXTURES.samir]);
});

test("an auditor cannot open the chart", () => {
  const { db, ctx } = signIn(FIXTURES.priya);
  assert.equal(ctx.facilityId, null);
  assert.equal(ctx.purposeOfUse, "AUDIT");
  assert.throws(() => listPatients(db, ctx), /cannot do that/i);
  assert.throws(() => getChart(db, ctx, FIXTURES.elena), /cannot do that/i);
});
