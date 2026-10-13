import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  FIXTURES,
  ForbiddenError,
  NotFoundError,
  OUTREACH_VERSION,
  ValidationError,
  activateCarePlan,
  claimCareTask,
  completeCareTask,
  createFollowUp,
  createReferral,
  decideReferral,
  draftCarePlan,
  explainCoordination,
  getChart,
  holdOutreachBody,
  listIncomingReferrals,
  openGapTask,
  openSession,
  readCoordination,
  readSession,
  sendOutreach,
  setOutreachPreference,
  createDatabase,
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

function actor(db: ReturnType<typeof createDatabase>, userId: string) {
  const ctx = readSession(db, openSession(db, userId).sessionId);
  if (!ctx) throw new Error("session missing");
  return ctx;
}

test("consent, locale, and a refused model decide whether a template is stored", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const missing = sendOutreach(db, ctx, { patientId: FIXTURES.elena, templateId: "tpl_followup", idempotencyKey: "care-send-miss01" });
  assert.equal(missing.outcome, "escalated");
  assert.equal(readCoordination(db, ctx, FIXTURES.elena)?.tasks.find((item) => item.id === missing.taskId)?.failure, "consent");
  setOutreachPreference(db, ctx, { patientId: FIXTURES.elena, locale: "en", channel: "none", consent: "granted", idempotencyKey: "care-pref-none01" });
  const channel = sendOutreach(db, ctx, { patientId: FIXTURES.elena, templateId: "tpl_followup", idempotencyKey: "care-send-none01" });
  assert.equal(readCoordination(db, ctx, FIXTURES.elena)?.tasks.find((item) => item.id === channel.taskId)?.failure, "channel");
  setOutreachPreference(db, ctx, { patientId: FIXTURES.elena, locale: "es", channel: "portal", consent: "granted", idempotencyKey: "care-pref-es0001" });
  const locale = sendOutreach(db, ctx, { patientId: FIXTURES.elena, templateId: "tpl_record_en", idempotencyKey: "care-send-loc001" });
  assert.equal(readCoordination(db, ctx, FIXTURES.elena)?.tasks.find((item) => item.id === locale.taskId)?.failure, "locale");
  const stored = sendOutreach(db, ctx, { patientId: FIXTURES.elena, templateId: "tpl_followup", idempotencyKey: "care-send-es0001" });
  assert.equal(stored.outcome, "stored");
  assert.equal(stored.body, "Hay un seguimiento guardado en el registro de su centro.");
  setOutreachPreference(db, ctx, { patientId: FIXTURES.elena, locale: "en", channel: "portal", consent: "granted", idempotencyKey: "care-pref-en0001" });
  const english = sendOutreach(db, ctx, { patientId: FIXTURES.elena, templateId: "tpl_followup", idempotencyKey: "care-send-en0001" });
  assert.equal(english.body, "A follow-up is stored on your facility record.");
  const calls = { n: 0 };
  const explained = explainCoordination(
    db,
    ctx,
    { patientId: FIXTURES.elena, idempotencyKey: "care-explain-001" },
    { provider: "probe", modelId: "mdl_probe", modelVersion: "1", invoke: () => { calls.n += 1; return { body: "should start treatment" }; } },
  );
  assert.equal(calls.n, 0);
  assert.equal(explained.aiText, null);
  assert.equal(explained.aiOutcome, "refused");
  if (!english.messageId || !english.body) throw new Error("message missing");
  assert.equal(holdOutreachBody(english.body, { body: "should start treatment" }), english.body);
  assert.equal(explained.messages.find((item) => item.id === english.messageId)?.body, english.body);
  const row = db.prepare("SELECT version FROM outreach_messages WHERE id = ?").get(english.messageId) as { version: string };
  assert.equal(row.version, OUTREACH_VERSION);
  const payload = db.prepare("SELECT payload_json FROM outbox WHERE event_type = 'care.message' ORDER BY created_at DESC LIMIT 1").get() as { payload_json: string };
  assert.equal(payload.payload_json.includes("follow-up is stored"), false);
  const jordan = actor(db, FIXTURES.jordan);
  if (!locale.taskId) throw new Error("task missing");
  const claimed = claimCareTask(db, jordan, { taskId: locale.taskId, idempotencyKey: "care-claim-0001" });
  assert.equal(claimed.ownerId, FIXTURES.jordan);
  const before = (db.prepare("SELECT COUNT(*) AS c FROM outreach_messages").get() as { c: number }).c;
  completeCareTask(db, jordan, { taskId: locale.taskId, idempotencyKey: "care-done-00001" });
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM outreach_messages").get() as { c: number }).c, before);
});

test("referrals stay inside the organization, and gaps cite a stored source", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const nurse = signIn(FIXTURES.jordan);
  assert.throws(
    () => createReferral(nurse.db, nurse.ctx, { patientId: FIXTURES.elena, toFacilityId: "fac_east", reason: "Recorded referral", idempotencyKey: "care-ref-nurse01" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  assert.throws(
    () => createReferral(db, ctx, { patientId: FIXTURES.elena, toFacilityId: "fac_lakeside", reason: "Recorded referral", idempotencyKey: "care-ref-other01" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  const referral = createReferral(db, ctx, { patientId: FIXTURES.elena, toFacilityId: "fac_east", reason: "Recorded referral", idempotencyKey: "care-ref-east001" });
  const lea = actor(db, FIXTURES.lea);
  assert.equal(getChart(db, lea, FIXTURES.elena), null);
  const incoming = listIncomingReferrals(db, lea);
  assert.equal(incoming[0]?.id, referral.referralId);
  assert.equal(incoming[0]?.reason, "Recorded referral");
  assert.equal(decideReferral(db, lea, { referralId: referral.referralId, decision: "accepted", idempotencyKey: "care-ref-accept1" }).status, "accepted");
  const evan = actor(db, FIXTURES.evan);
  assert.equal(listIncomingReferrals(db, evan).length, 0);
  assert.equal(readCoordination(db, evan, FIXTURES.elena), null);
  const plan = draftCarePlan(db, ctx, { patientId: FIXTURES.elena, goal: "Patient asked to keep the recorded follow-up.", idempotencyKey: "care-plan-00001" });
  const active = activateCarePlan(db, ctx, { planId: plan.planId, idempotencyKey: "care-plan-act001" });
  assert.equal(active.goal, plan.goal);
  const follow = createFollowUp(db, ctx, { patientId: FIXTURES.elena, dueOn: "2026-10-20", reason: "Call about the stored visit.", idempotencyKey: "care-follow-0001" });
  const jordan = actor(db, FIXTURES.jordan);
  assert.throws(
    () => completeCareTask(db, jordan, { taskId: follow.taskId, idempotencyKey: "care-follow-done1" }),
    (error: unknown) => error instanceof ConflictError,
  );
  completeCareTask(db, ctx, { taskId: follow.taskId, idempotencyKey: "care-follow-done2" });
  const gap = readCoordination(db, ctx, FIXTURES.elena)?.gaps.find((item) => item.sourceTable === "observations");
  if (!gap) throw new Error("gap missing");
  const opened = openGapTask(db, ctx, { patientId: FIXTURES.elena, sourceId: gap.sourceId, idempotencyKey: "care-gap-000001" });
  assert.equal(opened.reason, gap.text);
  assert.doesNotMatch(opened.reason, /recommend|diagnos|should start/i);
  assert.throws(
    () => openGapTask(db, ctx, { patientId: FIXTURES.elena, sourceId: "missing-source", idempotencyKey: "care-gap-missing1" }),
    (error: unknown) => error instanceof ValidationError,
  );
  const started = Date.now();
  for (let i = 0; i < 40; i += 1) {
    setOutreachPreference(db, ctx, { patientId: FIXTURES.elena, locale: "en", channel: "portal", consent: "granted", idempotencyKey: "care-replay-0001" });
  }
  assert.ok(Date.now() - started < 3000);
});
