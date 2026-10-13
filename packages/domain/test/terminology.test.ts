import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURES,
  TERMINOLOGY,
  ValidationError,
  createDatabase,
  getChart,
  listFacilityObservationCatalog,
  openSession,
  readSession,
  recordObservation,
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

test("a result stores the pinned code system and the facility binding", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const created = recordObservation(db, ctx, {
    patientId: FIXTURES.elena,
    code: "2823-3",
    value: 4.1,
    idempotencyKey: "term-k-00001",
  });
  const row = db
    .prepare("SELECT display, code_system_version, unit_system_version, binding_version FROM observations WHERE id = ?")
    .get(created.id) as {
    display: string;
    code_system_version: string;
    unit_system_version: string;
    binding_version: string;
  };
  assert.equal(row.display, "Potassium");
  assert.equal(row.code_system_version, TERMINOLOGY.loincVersion);
  assert.equal(row.unit_system_version, TERMINOLOGY.ucumVersion);
  assert.equal(row.binding_version, TERMINOLOGY.bindingVersion);
  const chart = getChart(db, ctx, FIXTURES.elena);
  const observation = chart?.observations.find((item) => item.id === created.id);
  assert.equal(observation?.codeSystemLabel, "LOINC");
  assert.equal(observation?.codeSystemVersion, "2.78");
  const condition = chart?.conditions.find((item) => item.code === "E11.9");
  assert.equal(condition?.codeSystemLabel, "ICD-10-CM");
  assert.equal(condition?.codeSystemVersion, "2026");
});

test("unknown codes and codes outside the facility catalog fail", () => {
  const riverside = signIn(FIXTURES.amira);
  assert.throws(
    () =>
      recordObservation(riverside.db, riverside.ctx, {
        patientId: FIXTURES.elena,
        code: "not-a-loinc",
        value: 1,
        idempotencyKey: "term-unknown1",
      }),
    ValidationError,
  );
  assert.throws(
    () =>
      recordObservation(riverside.db, riverside.ctx, {
        patientId: FIXTURES.elena,
        code: "29463-7",
        value: 70,
        idempotencyKey: "term-weight01",
      }),
    ValidationError,
  );
  const lakeside = signIn(FIXTURES.evan);
  const codes = listFacilityObservationCatalog(lakeside.db, lakeside.ctx).map((item) => item.code);
  assert.equal(codes.includes("30934-4"), false);
  assert.equal(codes.includes("8867-4"), true);
  assert.throws(
    () =>
      recordObservation(lakeside.db, lakeside.ctx, {
        patientId: FIXTURES.samir,
        code: "30934-4",
        value: 20,
        idempotencyKey: "term-bnp-0001",
      }),
    ValidationError,
  );
  const harborCodes = listFacilityObservationCatalog(riverside.db, riverside.ctx).map((item) => item.code);
  assert.equal(harborCodes.includes("30934-4"), true);
});
