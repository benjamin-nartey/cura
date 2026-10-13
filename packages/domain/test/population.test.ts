import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  FIXTURES,
  ForbiddenError,
  ValidationError,
  buildPopulation,
  createDatabase,
  createPatient,
  openSession,
  readPopulation,
  readSession,
  recordObservation,
  recordPopulationJurisdiction,
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

test("a cohort below 5 is hidden, and a released count has no person", () => {
  const { db, ctx: amira } = signIn(FIXTURES.amira);
  const priya = session(db, FIXTURES.priya);
  assert.throws(() => readPopulation(db, amira), (error: unknown) => error instanceof ForbiddenError);
  const first = buildPopulation(db, priya, "pop-build-0001");
  assert.equal(first.state?.decision, "evaluated");
  assert.equal(first.state?.cohorts.find((item) => item.id === "chronic-problems")?.status, "suppressed");
  assert.equal(first.state?.cohorts.find((item) => item.id === "recorded-systolic")?.status, "suppressed");
  assert.equal(first.state?.cohorts.find((item) => item.id === "vaccination")?.status, "not-stored");
  assert.equal(first.state?.cohorts.find((item) => item.id === "facility-map")?.status, "not-stored");
  assert.match(first.state?.cohorts.find((item) => item.id === "facility-map")?.text ?? "", /map trend is not calculated/);
  assert.equal(JSON.stringify(first).includes("pat_elena"), false);
  assert.equal(JSON.stringify(first).includes("Elena"), false);
  assert.equal(JSON.stringify(first).includes("E11.9"), false);
  const people = [
    ["Nora", "Lane", "1991-01-01", "pop-pat-0001"],
    ["Quinn", "Dale", "1992-02-02", "pop-pat-0002"],
    ["Ivy", "Cole", "1993-03-03", "pop-pat-0003"],
  ] as const;
  for (const [index, [givenName, familyName, birthDate, key]] of people.entries()) {
    const created = createPatient(db, amira, { givenName, familyName, birthDate, sex: "female", idempotencyKey: key });
    recordObservation(db, amira, { patientId: created.id, code: "8480-6", value: 120 + index, idempotencyKey: `pop-obs-${index}001` });
  }
  assert.equal(readPopulation(db, priya).stale, true);
  const released = buildPopulation(db, priya, "pop-build-0002");
  const systolic = released.state?.cohorts.find((item) => item.id === "recorded-systolic");
  assert.equal(systolic?.status, "released");
  assert.equal(systolic?.total, 5);
  assert.deepEqual(systolic?.facilities, [{ facilityId: "fac_riverside", count: 5 }]);
  assert.equal(JSON.stringify(released).includes("Nora"), false);
  assert.equal(JSON.stringify(released).includes("148"), false);
  const replayed = buildPopulation(db, priya, "pop-build-0002");
  assert.equal(replayed.version, released.version);
  recordObservation(db, session(db, FIXTURES.lea), {
    patientId: FIXTURES.noor,
    code: "8480-6",
    value: 130,
    idempotencyKey: "pop-obs-east1",
  });
  const hidden = buildPopulation(db, priya, "pop-build-0003");
  const hiddenSystolic = hidden.state?.cohorts.find((item) => item.id === "recorded-systolic");
  assert.equal(hiddenSystolic?.status, "suppressed");
  assert.equal(hiddenSystolic?.facilities.length, 0);
  assert.equal(JSON.stringify(hidden).includes("fac_east"), false);
  assert.equal(JSON.stringify(hidden).includes("pat_samir"), false);
  recordPopulationJurisdiction(db, priya, { tag: "restricted", idempotencyKey: "pop-tag-0001" });
  const withheld = buildPopulation(db, priya, "pop-build-0004");
  assert.equal(withheld.state?.decision, "withheld");
  assert.equal(withheld.state?.cohorts.length, 0);
  assert.match(withheld.state?.text ?? "", /not released/);
  assert.equal(JSON.stringify(withheld.state).includes("fac_riverside"), false);
});

test("a jurisdiction tag outside the pin is refused", () => {
  const { db, ctx } = signIn(FIXTURES.priya);
  assert.throws(
    () => recordPopulationJurisdiction(db, ctx, { tag: "EU-GDPR", idempotencyKey: "pop-tag-bad01" }),
    (error: unknown) => error instanceof ValidationError,
  );
  recordPopulationJurisdiction(db, ctx, { tag: "restricted", idempotencyKey: "pop-tag-0002" });
  assert.throws(
    () => recordPopulationJurisdiction(db, ctx, { tag: "local-synthetic", idempotencyKey: "pop-tag-0002" }),
    (error: unknown) => error instanceof ConflictError,
  );
});
