import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  FIXTURES,
  ForbiddenError,
  ValidationError,
  completeEncounter,
  createDatabase,
  createEncounter,
  createPatient,
  getChart,
  listDirectory,
  listWorklist,
  openSession,
  readSession,
  recordObservation,
  seed,
} from "../src/index.ts";

function amira() {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, FIXTURES.amira);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

test("registration is idempotent, facility-scoped, and ignores a forged organization", () => {
  const { db, ctx } = amira();
  const input = {
    givenName: "Ada",
    familyName: "Quill",
    birthDate: "1991-04-04",
    sex: "female" as const,
    idempotencyKey: "key-ada-001",
  };
  const first = createPatient(db, ctx, input);
  const second = createPatient(db, ctx, input);
  assert.equal(first.id, second.id);
  const row = db.prepare("SELECT organization_id, facility_id FROM patients WHERE id = ?").get(first.id) as {
    organization_id: string;
    facility_id: string;
  };
  assert.equal(row.organization_id, ctx.organizationId);
  assert.equal(row.facility_id, ctx.facilityId);
  assert.throws(
    () => createPatient(db, ctx, { ...input, familyName: "Other", idempotencyKey: "key-ada-001" }),
    ConflictError,
  );
  const outbox = db.prepare("SELECT payload_json FROM outbox WHERE event_type = 'patient.registered'").all() as {
    payload_json: string;
  }[];
  assert.equal(outbox.length, 1);
  assert.equal(JSON.parse(outbox[0].payload_json).patientId, first.id);
  assert.equal(JSON.parse(outbox[0].payload_json).givenName, undefined);
});

test("the same idempotency key can be used in another organization", () => {
  const harbor = amira();
  const northDb = harbor.db;
  const northOpened = openSession(northDb, FIXTURES.evan);
  const north = readSession(northDb, northOpened.sessionId);
  if (!north) throw new Error("session missing");
  const input = {
    givenName: "Ada",
    familyName: "Quill",
    birthDate: "1991-04-04",
    sex: "female" as const,
    idempotencyKey: "shared-key-01",
  };
  const a = createPatient(harbor.db, harbor.ctx, input);
  const b = createPatient(harbor.db, north, input);
  assert.notEqual(a.id, b.id);
});

test("a nurse may record a result but may not register a patient", () => {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, FIXTURES.jordan);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  assert.throws(
    () =>
      createPatient(db, ctx, {
        givenName: "Ada",
        familyName: "Quill",
        birthDate: "1991-04-04",
        sex: "female",
        idempotencyKey: "nurse-reg-01",
      }),
    ForbiddenError,
  );
  const recorded = recordObservation(db, ctx, {
    patientId: FIXTURES.elena,
    code: "8867-4",
    value: 72,
    idempotencyKey: "nurse-hr-0001",
  });
  const again = recordObservation(db, ctx, {
    patientId: FIXTURES.elena,
    code: "8867-4",
    value: 72,
    idempotencyKey: "nurse-hr-0001",
  });
  assert.equal(recorded.id, again.id);
  const chart = getChart(db, ctx, FIXTURES.elena);
  assert.ok(chart?.observations.some((item) => item.id === recorded.id && item.interpretation === "normal"));
});

test("finishing an encounter conflicts on a stale version and blocks a second open encounter", () => {
  const { db, ctx } = amira();
  assert.throws(
    () => createEncounter(db, ctx, { patientId: FIXTURES.mateo, reason: "Review", idempotencyKey: "enc-open-01" }),
    ConflictError,
  );
  const opened = createEncounter(db, ctx, { patientId: FIXTURES.elena, reason: "Volume review", idempotencyKey: "enc-open-02" });
  db.prepare("UPDATE encounters SET version = 2 WHERE id = ?").run(opened.id);
  assert.throws(
    () => completeEncounter(db, ctx, { encounterId: opened.id, expectedVersion: 1, idempotencyKey: "enc-stale-01" }),
    ConflictError,
  );
  db.prepare("UPDATE encounters SET version = 1 WHERE id = ?").run(opened.id);
  const done = completeEncounter(db, ctx, { encounterId: opened.id, expectedVersion: 1, idempotencyKey: "enc-done-01" });
  assert.equal(done.version, 2);
  const replay = completeEncounter(db, ctx, { encounterId: opened.id, expectedVersion: 1, idempotencyKey: "enc-done-01" });
  assert.deepEqual(replay, done);
  assert.throws(
    () => completeEncounter(db, ctx, { encounterId: opened.id, expectedVersion: 1, idempotencyKey: "enc-done-02" }),
    ConflictError,
  );
});

test("observation codes and entry bounds are enforced, and the client cannot set the flag", () => {
  const { db, ctx } = amira();
  assert.throws(
    () => recordObservation(db, ctx, { patientId: FIXTURES.elena, code: "not-a-code", value: 1, idempotencyKey: "bad-code-01" }),
    ValidationError,
  );
  assert.throws(
    () => recordObservation(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", value: 40, idempotencyKey: "bad-range-1" }),
    ValidationError,
  );
  const high = recordObservation(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", value: 5.6, idempotencyKey: "k-high-0001" });
  const chart = getChart(db, ctx, FIXTURES.elena);
  const row = chart?.observations.find((item) => item.id === high.id);
  assert.equal(row?.interpretation, "high");
  assert.match(row?.thresholdText ?? "", /above 5/);
});

test("the worklist for 8 Oct 2026 is the riverside book", () => {
  const { db, ctx } = amira();
  const board = listWorklist(db, ctx, new Date("2026-10-08T12:00:00.000Z"));
  assert.deepEqual(
    board.appointments.map((item) => item.patientName),
    ["Elena Voss", "Helen Park"],
  );
  assert.equal(board.openEncounters.length, 1);
  assert.match(board.openEncounters[0].reason, /Wheeze/);
});

test("the development directory is refused in production mode", () => {
  const db = createDatabase(":memory:");
  seed(db);
  const previous = process.env.CURASPHERE_ENV;
  process.env.CURASPHERE_ENV = "production";
  try {
    assert.throws(() => listDirectory(db), /disabled/i);
    assert.throws(() => openSession(db, FIXTURES.amira), /disabled/i);
  } finally {
    if (previous === undefined) delete process.env.CURASPHERE_ENV;
    else process.env.CURASPHERE_ENV = previous;
  }
});
