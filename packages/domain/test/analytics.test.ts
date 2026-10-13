import assert from "node:assert/strict";
import test from "node:test";
import {
  ANALYTICS_CELL_MINIMUM,
  ANALYTICS_DEID_VERSION,
  ANALYTICS_GOVERNANCE_VERSION,
  ConflictError,
  FIXTURES,
  ForbiddenError,
  ValidationError,
  containsDirectIdentifier,
  createDatabase,
  exportAnalytics,
  ingestAnalytics,
  openSession,
  readAnalytics,
  readSession,
  recordObservation,
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

test("an auditor ingests de-identified events, and a small cell stays suppressed", () => {
  const { db, ctx: amira } = signIn(FIXTURES.amira);
  const priya = session(db, FIXTURES.priya);
  assert.throws(() => readAnalytics(db, amira), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => ingestAnalytics(db, amira, "an-ingest-deny"), (error: unknown) => error instanceof ForbiddenError);
  for (const [index, value] of [120, 122, 124, 126, 128].entries()) {
    recordObservation(db, amira, {
      patientId: FIXTURES.elena,
      code: "8480-6",
      value,
      idempotencyKey: `an-obs-${index}0001`,
    });
  }
  const ingested = ingestAnalytics(db, priya, "an-ingest-0001");
  assert.equal(ingested.copied, 5);
  assert.equal(ingested.governanceVersion, ANALYTICS_GOVERNANCE_VERSION);
  assert.equal(ingested.deidVersion, ANALYTICS_DEID_VERSION);
  const replayed = ingestAnalytics(db, priya, "an-ingest-0001");
  assert.equal(replayed.copied, ingested.copied);
  const view = readAnalytics(db, priya);
  assert.equal(view.factCount, 5);
  const serialized = JSON.stringify(view.facts);
  assert.equal(serialized.includes("pat_elena"), false);
  assert.equal(serialized.includes("Elena"), false);
  assert.equal(serialized.includes("8480-6"), false);
  assert.equal(view.facts.every((fact) => fact.droppedKeys.includes("patientId")), true);
  assert.equal(view.facts.every((fact) => fact.facilityId === "fac_riverside"), true);
  recordObservation(db, session(db, FIXTURES.evan), {
    patientId: FIXTURES.samir,
    code: "8480-6",
    value: 118,
    idempotencyKey: "an-obs-evan01",
  });
  const later = ingestAnalytics(db, priya, "an-ingest-0002");
  assert.equal(later.copied, 1);
  const scoped = readAnalytics(db, priya);
  assert.equal(JSON.stringify(scoped.facts).includes("pat_samir"), false);
  assert.equal(scoped.facts.some((fact) => fact.facilityId === "fac_lakeside"), false);
  const exported = exportAnalytics(db, priya, { metricId: "events-by-type", idempotencyKey: "an-export-0001" });
  assert.equal(exported.decision, "release");
  assert.equal(exported.body?.cells.every((cell) => cell.count >= ANALYTICS_CELL_MINIMUM), true);
  assert.equal(exported.body?.cells.some((cell) => cell.key === "observation.recorded" && cell.count === 5), true);
  assert.equal(exported.assessment.suppressed.some((cell) => cell.count < ANALYTICS_CELL_MINIMUM), true);
  assert.equal(exported.assessment.directIdentifierFound, false);
  assert.match(exported.assessment.text, /not a patient list/);
  assert.equal(JSON.stringify(exported.body).includes("Elena"), false);
  assert.equal(JSON.stringify(exported.body).includes("pat_elena"), false);
  const lineage = exported.lineage.cells.find((cell) => cell.key === "observation.recorded");
  assert.equal(lineage?.outboxIds.length, 5);
  assert.equal(lineage?.factIds.length, 5);
  const again = exportAnalytics(db, priya, { metricId: "events-by-type", idempotencyKey: "an-export-0001" });
  assert.equal(again.exportId, exported.exportId);
});

test("a metric outside the pin is refused, and a name in the text is an identifier", () => {
  const { db, ctx: priya } = signIn(FIXTURES.priya);
  assert.throws(
    () => exportAnalytics(db, priya, { metricId: "select * from patients", idempotencyKey: "an-metric-bad1" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.equal(containsDirectIdentifier(db, priya.organizationId, "Elena"), true);
  assert.equal(containsDirectIdentifier(db, priya.organizationId, "events-by-type"), false);
  assert.throws(
    () => exportAnalytics(db, priya, { metricId: "events-by-facility", idempotencyKey: "an-export-0001" }) &&
      exportAnalytics(db, priya, { metricId: "events-by-type", idempotencyKey: "an-export-0001" }),
    (error: unknown) => error instanceof ConflictError,
  );
});
