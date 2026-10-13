import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURES,
  ForbiddenError,
  ValidationError,
  createDatabase,
  openSession,
  readPatientTimeline,
  readSession,
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

test("the timeline projection is stable and every change cites a source row", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const now = new Date("2026-10-08T12:00:00.000Z");
  const first = readPatientTimeline(db, ctx, FIXTURES.elena, "all", now);
  const second = readPatientTimeline(db, ctx, FIXTURES.elena, "all", now);
  if (!first || !second) throw new Error("timeline missing");
  assert.deepEqual(first.events, second.events);
  assert.deepEqual(first.changes, second.changes);
  assert.equal(first.since, "2026-09-01T16:00:00.000Z");
  assert.ok(first.events.length < 100);
  const ids = new Set(first.events.map((event) => event.id));
  assert.equal(ids.size, first.events.length);
  for (const change of first.changes) {
    assert.ok(first.events.some((event) => event.sourceId === change.sourceId && event.sourceTable === change.sourceTable));
  }
  for (const day of first.days) {
    for (const event of day.events) assert.equal(event.at.slice(0, 10), day.day);
  }
  assert.ok(first.days.length > 1);
  assert.ok(first.days[0].day >= first.days[1].day);
});

test("a results filter keeps observations and drops other source rows", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const all = readPatientTimeline(db, ctx, FIXTURES.elena, "all");
  const results = readPatientTimeline(db, ctx, FIXTURES.elena, "results");
  if (!all || !results) throw new Error("timeline missing");
  assert.ok(results.events.length > 0);
  assert.ok(results.events.length < all.events.length);
  for (const event of results.events) {
    assert.equal(event.kind, "observation");
    assert.equal(event.sourceTable, "observations");
  }
  assert.ok(results.events.some((event) => event.sourceId === FIXTURES.obsPotassiumHigh));
  assert.throws(() => readPatientTimeline(db, ctx, FIXTURES.elena, "generated"), ValidationError);
});

test("another facility and an auditor cannot read the timeline", () => {
  const evan = signIn(FIXTURES.evan);
  assert.equal(readPatientTimeline(evan.db, evan.ctx, FIXTURES.elena, "all"), null);
  const denied = evan.db
    .prepare("SELECT outcome FROM audit_events WHERE action = 'patient.read' AND resource_id = ?")
    .get(FIXTURES.elena) as { outcome: string };
  assert.equal(denied.outcome, "denied");
  const priya = signIn(FIXTURES.priya);
  assert.throws(() => readPatientTimeline(priya.db, priya.ctx, FIXTURES.elena, "results"), ForbiddenError);
});
