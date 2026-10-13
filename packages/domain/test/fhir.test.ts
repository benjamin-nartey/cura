import assert from "node:assert/strict";
import test from "node:test";
import {
  FHIR_VERSION,
  FIXTURES,
  ForbiddenError,
  ValidationError,
  assertValidR4,
  createDatabase,
  createFhirObservation,
  createFhirSubscription,
  fhirCapability,
  listSubscriptionNotifications,
  openSession,
  readFhirExport,
  readFhirResource,
  readSession,
  searchFhir,
  seed,
  startFhirExport,
} from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

const heartRate = {
  resourceType: "Observation",
  status: "final",
  code: { coding: [{ system: "http://loinc.org", code: "8867-4", display: "Not the pin" }] },
  subject: { reference: `Patient/${FIXTURES.elena}` },
  valueQuantity: { value: 72, system: "http://unitsofmeasure.org", code: "/min" },
};

test("a created observation round-trips with the facility pin", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const created = createFhirObservation(db, ctx, heartRate, "fhir-hr-0001");
  assert.equal(created.resourceType, "Observation");
  const code = (created.code as { coding: Array<{ code: string; version: string; display: string }> }).coding[0];
  assert.equal(code.code, "8867-4");
  assert.equal(code.version, "2.78");
  assert.equal(code.display, "Heart rate");
  assert.equal((created.valueQuantity as { value: number; code: string }).value, 72);
  assert.equal((created.valueQuantity as { code: string }).code, "/min");
  assert.equal((created.subject as { reference: string }).reference, `Patient/${FIXTURES.elena}`);
  assertValidR4(created);
  const again = createFhirObservation(db, ctx, heartRate, "fhir-hr-0001");
  assert.equal(again.id, created.id);
  const mirrored = createFhirObservation(db, ctx, { ...heartRate, valueQuantity: { value: 80, system: "http://unitsofmeasure.org", code: "/min" } }, "fhir-hr-0002", "obs_foundation-mirror-0001");
  assert.equal(mirrored.id, "obs_foundation-mirror-0001");
  const read = readFhirResource(db, ctx, "Observation", String(created.id));
  assert.equal(read?.id, created.id);
});

test("the capability statement is R4 and does not advertise SMART", () => {
  const statement = fhirCapability();
  assert.equal(statement.fhirVersion, FHIR_VERSION);
  assertValidR4(statement);
  const encoded = JSON.stringify(statement);
  assert.equal(encoded.includes("fhir-registry.smarthealthit.org"), false);
  assert.equal(encoded.includes("oauth"), false);
});

test("seeded chart resources keep their code-system versions", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const patient = readFhirResource(db, ctx, "Patient", FIXTURES.elena);
  assert.equal((patient?.name as Array<{ family: string }>)[0].family, "Voss");
  assert.equal(patient?.gender, "female");
  assertValidR4(patient!);
  const condition = readFhirResource(db, ctx, "Condition", "con_elena_dm");
  const coding = (condition?.code as { coding: Array<{ code: string; version: string }> }).coding[0];
  assert.equal(coding.code, "E11.9");
  assert.equal(coding.version, "2026");
  assertValidR4(condition!);
  const allergy = readFhirResource(db, ctx, "AllergyIntolerance", "all_elena");
  assert.equal((allergy?.code as { text: string }).text, "Penicillin");
  assertValidR4(allergy!);
});

test("another facility and an auditor cannot read the resource", () => {
  const amira = signIn(FIXTURES.amira);
  const evan = signIn(FIXTURES.evan);
  assert.equal(readFhirResource(evan.db, evan.ctx, "Patient", FIXTURES.elena), null);
  const denied = evan.db
    .prepare("SELECT outcome FROM audit_events WHERE action = 'fhir.read' AND resource_id = ?")
    .get(FIXTURES.elena) as { outcome: string };
  assert.equal(denied.outcome, "denied");
  const search = searchFhir(amira.db, amira.ctx, "Patient", { name: "Samir" });
  assert.equal(search.total, 0);
  const priya = signIn(FIXTURES.priya);
  assert.throws(() => readFhirResource(priya.db, priya.ctx, "Patient", FIXTURES.elena), ForbiddenError);
});

test("a mismatched unit, an unknown code, and a remote inbox are rejected", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  assert.throws(
    () =>
      createFhirObservation(
        db,
        ctx,
        { ...heartRate, valueQuantity: { value: 72, code: "mmHg" } },
        "fhir-bad-unit1",
      ),
    ValidationError,
  );
  assert.throws(
    () =>
      createFhirObservation(
        db,
        ctx,
        {
          ...heartRate,
          code: { coding: [{ system: "http://loinc.org", code: "29463-7" }] },
          valueQuantity: { value: 70, code: "kg" },
        },
        "fhir-weight01",
      ),
    ValidationError,
  );
  assert.throws(
    () =>
      createFhirSubscription(
        db,
        ctx,
        {
          resourceType: "Subscription",
          status: "requested",
          criteria: "Observation",
          channel: { type: "rest-hook", endpoint: "https://example.invalid/hook" },
        },
        "fhir-hook-001",
      ),
    ValidationError,
  );
});

test("a local subscription receives the observation that was stored", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const subscription = createFhirSubscription(
    db,
    ctx,
    {
      resourceType: "Subscription",
      criteria: "Observation",
      channel: { type: "rest-hook", endpoint: "local-inbox" },
    },
    "fhir-sub-0001",
  );
  assertValidR4(subscription);
  const created = createFhirObservation(db, ctx, heartRate, "fhir-hr-sub01");
  const notes = listSubscriptionNotifications(db, ctx, String(subscription.id));
  assert.equal(notes.length, 1);
  const entry = (notes[0].entry as Array<{ resource: { id: string } }>)[0];
  assert.equal(entry.resource.id, created.id);
  assertValidR4(notes[0]);
});

test("facility export contains that facility and no other", () => {
  const riverside = signIn(FIXTURES.amira);
  const job = startFhirExport(riverside.db, riverside.ctx, "fhir-exp-0001");
  const again = startFhirExport(riverside.db, riverside.ctx, "fhir-exp-0001");
  assert.equal(again.id, job.id);
  const exported = readFhirExport(riverside.db, riverside.ctx, job.id);
  assert.ok(exported.lineCount < 500);
  assert.equal(exported.ndjson.includes(FIXTURES.elena), true);
  assert.equal(exported.ndjson.includes(FIXTURES.samir), false);
  assert.equal(exported.ndjson.includes("\"fhirVersion\""), false);
  const lakeside = signIn(FIXTURES.evan);
  const other = startFhirExport(lakeside.db, lakeside.ctx, "fhir-exp-evan1");
  const lakesideFile = readFhirExport(lakeside.db, lakeside.ctx, other.id);
  assert.equal(lakesideFile.ndjson.includes(FIXTURES.samir), true);
  assert.equal(lakesideFile.ndjson.includes(FIXTURES.elena), false);
  assert.throws(() => readFhirExport(lakeside.db, lakeside.ctx, job.id), Error);
});
