import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURES,
  ForbiddenError,
  createDatabase,
  createEncounter,
  openSession,
  readPatientState,
  readSession,
  rebuildPatientState,
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

test("a rebuild matches the source rows and a second rebuild keeps the version", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const first = rebuildPatientState(db, ctx, FIXTURES.elena, "state-elena-001");
  const second = rebuildPatientState(db, ctx, FIXTURES.elena, "state-elena-002");
  assert.equal(first.built, true);
  assert.equal(first.stale, false);
  assert.equal(first.version, 1);
  assert.equal(second.version, 1);
  assert.equal(second.builtAt, first.builtAt);
  const state = first.state;
  if (!state) throw new Error("state missing");
  assert.deepEqual(
    state.problems.map((item) => item.text).sort(),
    ["Heart failure · I50.9", "Type 2 diabetes mellitus · E11.9"],
  );
  assert.equal(state.allergies.some((item) => item.text.includes("Penicillin")), true);
  assert.equal(state.recentResults.some((item) => item.sourceId === FIXTURES.obsPotassiumHigh), true);
  assert.equal(state.recentResults.some((item) => item.sourceId === FIXTURES.obsPotassiumNormal), false);
  assert.equal(state.pending.some((item) => item.sourceId === "apt_elena"), true);
  assert.equal(state.careGaps.some((item) => item.text.includes("above 5 mmol/L")), true);
  assert.equal(state.careGaps.some((item) => item.sourceId === "apt_elena"), true);
  assert.equal(state.riskSignals[0].status, "unfilled");
  assert.equal("value" in state.riskSignals[0], false);
  assert.doesNotMatch(JSON.stringify(state), /recommend|diagnos|should start|likely has/i);
  const again = readPatientState(db, ctx, FIXTURES.elena);
  assert.equal(again?.stale, false);
  assert.equal(again?.version, 1);
});

test("a new source row marks the build stale and the next rebuild cites it", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  rebuildPatientState(db, ctx, FIXTURES.elena, "state-elena-010");
  const created = recordObservation(db, ctx, {
    patientId: FIXTURES.elena,
    code: "8867-4",
    value: 72,
    idempotencyKey: "state-hr-00001",
  });
  const stale = readPatientState(db, ctx, FIXTURES.elena);
  assert.equal(stale?.stale, true);
  assert.equal(stale?.version, 1);
  assert.equal(JSON.stringify(stale?.state).includes(created.id), false);
  const rebuilt = rebuildPatientState(db, ctx, FIXTURES.elena, "state-elena-011");
  assert.equal(rebuilt.version, 2);
  assert.equal(rebuilt.stale, false);
  assert.equal(JSON.stringify(rebuilt.state).includes(created.id), true);
  const rows = db.prepare("SELECT version FROM patient_state_builds WHERE patient_id = ? ORDER BY version").all(FIXTURES.elena) as {
    version: number;
  }[];
  assert.deepEqual(rows.map((row) => row.version), [1, 2]);
});

test("two results at the same time stay listed as a conflict", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  db.prepare(
    `INSERT INTO observations (id, organization_id, facility_id, patient_id, encounter_id, code, code_system, code_system_version, display, value, unit, unit_system_version, binding_version, interpretation, threshold_text, effective_at, author_id, recorded_at)
     VALUES ('obs_elena_k_tie', 'org_harborlight', 'fac_riverside', 'pat_elena', NULL, '2823-3', 'http://loinc.org', '2.78', 'Potassium', 5.1, 'mmol/L', '2.2', 'facility-vitals-2026.10', 'high', 'above 5 mmol/L', '2026-10-01T15:00:00.000Z', 'usr_amira', '2026-10-01T15:00:00.000Z')`,
  ).run();
  const built = rebuildPatientState(db, ctx, FIXTURES.elena, "state-elena-tie1");
  const conflict = built.state?.conflicts.find((item) => item.kind === "duplicate-result" && item.code === "2823-3");
  assert.ok(conflict);
  assert.deepEqual(
    conflict?.sources.map((item) => item.sourceId).sort(),
    [FIXTURES.obsPotassiumHigh, "obs_elena_k_tie"].sort(),
  );
  assert.equal(built.state?.recentResults.some((item) => item.text.includes("Potassium")), false);
});

test("an open encounter without a result is pending work", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const opened = createEncounter(db, ctx, {
    patientId: FIXTURES.elena,
    reason: "Chart review",
    idempotencyKey: "state-enc-0001",
  });
  const built = rebuildPatientState(db, ctx, FIXTURES.elena, "state-elena-enc1");
  assert.equal(built.state?.pending.some((item) => item.sourceId === opened.id), true);
  assert.equal(built.state?.careGaps.some((item) => item.text.includes("No result is stored on this encounter")), true);
  assert.equal(built.state?.careGaps.some((item) => item.sourceId === "apt_elena"), false);
});

test("another facility and an auditor cannot read the materialization", () => {
  const amira = signIn(FIXTURES.amira);
  rebuildPatientState(amira.db, amira.ctx, FIXTURES.elena, "state-elena-iso1");
  const evan = signIn(FIXTURES.evan);
  assert.equal(readPatientState(evan.db, evan.ctx, FIXTURES.elena), null);
  const priya = signIn(FIXTURES.priya);
  assert.throws(() => readPatientState(priya.db, priya.ctx, FIXTURES.elena), ForbiddenError);
});
