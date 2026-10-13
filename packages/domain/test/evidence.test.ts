import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURES,
  ForbiddenError,
  ValidationError,
  createDatabase,
  openSession,
  readEvidence,
  readSession,
  rebuildPatientState,
  rejectUncitedClaim,
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

test("a rebuild files a supported claim for each derived line", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  rebuildPatientState(db, ctx, FIXTURES.elena, "evidence-elena-01");
  const first = readEvidence(db, ctx, FIXTURES.elena);
  rebuildPatientState(db, ctx, FIXTURES.elena, "evidence-elena-02");
  const second = readEvidence(db, ctx, FIXTURES.elena);
  if (!first || !second) throw new Error("evidence missing");
  assert.ok(first.claims.length > 0);
  assert.ok(first.claims.length < 40);
  assert.equal(second.claims.length, first.claims.length);
  for (const claim of first.claims) {
    assert.ok(claim.evidenceState === "supported" || claim.evidenceState === "invalidated" || claim.evidenceState === "insufficient");
    assert.ok(claim.citations.length > 0);
    assert.match(claim.citations[0].label, /·/);
  }
  const potassium = first.claims.find((claim) => claim.citations.some((item) => item.sourceId === FIXTURES.obsPotassiumHigh));
  assert.ok(potassium);
  assert.equal(potassium?.evidenceState, "supported");
  assert.equal(first.claims.some((claim) => claim.text.includes("No score is stored")), false);
  assert.doesNotMatch(JSON.stringify(first.claims), /recommend|diagnos|should start|likely has/i);
});

test("a claim without a citation is refused", () => {
  assert.throws(() => rejectUncitedClaim([]), ValidationError);
});

test("a changed source invalidates the claim that cited it", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  rebuildPatientState(db, ctx, FIXTURES.elena, "evidence-elena-10");
  db.prepare("UPDATE observations SET value = 9.1 WHERE id = ?").run(FIXTURES.obsPotassiumHigh);
  const refreshed = readEvidence(db, ctx, FIXTURES.elena);
  const invalidated = refreshed?.claims.filter((claim) => claim.evidenceState === "invalidated") ?? [];
  assert.ok(invalidated.some((claim) => claim.citations.some((item) => item.sourceId === FIXTURES.obsPotassiumHigh)));
  assert.ok(invalidated.every((claim) => claim.citations.length > 0));
  const rebuilt = rebuildPatientState(db, ctx, FIXTURES.elena, "evidence-elena-11");
  assert.equal(rebuilt.version, 2);
  const after = readEvidence(db, ctx, FIXTURES.elena);
  const supported = after?.claims.find(
    (claim) => claim.evidenceState === "supported" && claim.citations.some((item) => item.sourceId === FIXTURES.obsPotassiumHigh) && claim.text.includes("9.1"),
  );
  assert.ok(supported);
  assert.ok(after?.claims.some((claim) => claim.evidenceState === "invalidated"));
});

test("another facility and an auditor cannot read the claims", () => {
  const amira = signIn(FIXTURES.amira);
  rebuildPatientState(amira.db, amira.ctx, FIXTURES.elena, "evidence-elena-iso");
  const evan = signIn(FIXTURES.evan);
  assert.equal(readEvidence(evan.db, evan.ctx, FIXTURES.elena), null);
  const priya = signIn(FIXTURES.priya);
  assert.throws(() => readEvidence(priya.db, priya.ctx, FIXTURES.elena), ForbiddenError);
});
