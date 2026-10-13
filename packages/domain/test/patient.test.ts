import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  FIXTURES,
  ForbiddenError,
  NotFoundError,
  PATIENT_COPY_VERSION,
  TRIAGE_TEXT,
  ValidationError,
  askPatient,
  assertPatientTool,
  createDatabase,
  decideAppointmentRequest,
  explainPortal,
  getChart,
  holdPatientInstruction,
  openPatientSession,
  openSession,
  readDocumentation,
  readPatientDesk,
  readPatientSession,
  readPortal,
  readSession,
  recordPatientPayment,
  requestAppointment,
  seed,
  storeCoverage,
  storePatientQuestion,
} from "../src/index.ts";

function signIn(principalId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openPatientSession(db, principalId);
  const ctx = readPatientSession(db, opened.sessionId);
  if (!ctx) throw new Error("patient session missing");
  return { db, ctx, sessionId: opened.sessionId };
}

function clinician(db: ReturnType<typeof createDatabase>, userId: string) {
  const ctx = readSession(db, openSession(db, userId).sessionId);
  if (!ctx) throw new Error("session missing");
  return ctx;
}

test("a patient sees only their own record, and urgent text stays on the pinned instruction", () => {
  const { db, ctx, sessionId } = signIn(FIXTURES.elenaPortal);
  assert.equal(readSession(db, sessionId), null);
  assert.throws(() => getChart(db, ctx, FIXTURES.elena), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => readDocumentation(db, ctx, FIXTURES.elena), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => assertPatientTool("tool_chart_sources"), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => assertPatientTool("tool_propose_review"), (error: unknown) => error instanceof ForbiddenError);
  assertPatientTool("own-results");
  const view = readPortal(db, ctx);
  assert.equal(view.patientId, FIXTURES.elena);
  assert.equal(view.medications.some((item) => item.display === "Furosemide"), true);
  assert.equal(view.appointments.some((item) => item.id === "apt_elena"), true);
  assert.equal(view.results.some((item) => item.display === "Potassium" && item.explanation.includes("not a diagnosis")), true);
  assert.equal(view.results[0]?.version, PATIENT_COPY_VERSION);
  const blob = JSON.stringify(view);
  for (const hidden of ["Albuterol", "Mateo", "usr_amira", "enc_elena", "transcript", "referral", "copilot", "threshold", "tool_chart_sources"]) {
    assert.equal(blob.includes(hidden), false, hidden);
  }
  const calls = { n: 0 };
  const adapter = { provider: "probe", modelId: "mdl_probe", modelVersion: "1", invoke: () => { calls.n += 1; return { text: "you are fine, stay home" }; } };
  const urgent = askPatient(db, ctx, { text: "I have chest pain", idempotencyKey: "portal-ask-urgent1" }, adapter);
  assert.equal(calls.n, 0);
  assert.equal(urgent.outcome, "triage");
  assert.equal(urgent.tool, "urgent-triage");
  assert.equal(urgent.instruction, TRIAGE_TEXT);
  assert.equal(urgent.aiText, null);
  assert.equal(urgent.aiOutcome, "refused");
  assert.equal(holdPatientInstruction(TRIAGE_TEXT, { text: "you are fine, stay home" }), TRIAGE_TEXT);
  const potassium = askPatient(db, ctx, { text: "What is my potassium result?", idempotencyKey: "portal-ask-result1" }, adapter);
  assert.equal(calls.n, 0);
  assert.equal(potassium.tool, "own-results");
  assert.equal(potassium.aiText, null);
  assert.equal(potassium.lines.some((line) => line.startsWith("Potassium")), true);
  assert.equal(potassium.lines.some((line) => /should start|likely has|prescrib/i.test(line)), false);
  const explained = explainPortal(db, ctx, { idempotencyKey: "portal-explain-001" }, adapter);
  assert.equal(calls.n, 0);
  assert.equal(explained.aiText, null);
  assert.equal(explained.results.some((item) => item.display === "Potassium"), true);
  const mateo = readPatientSession(db, openPatientSession(db, FIXTURES.mateoPortal).sessionId);
  if (!mateo) throw new Error("mateo missing");
  assert.equal(readPortal(db, mateo).medications.some((item) => item.display === "Furosemide"), false);
  assert.equal(readPortal(db, mateo).medications.some((item) => item.display === "Albuterol inhaler"), true);
  assert.throws(() => openPatientSession(db, FIXTURES.amira), (error: unknown) => error instanceof NotFoundError);
  const evan = clinician(db, FIXTURES.evan);
  assert.equal(readPatientDesk(db, evan, FIXTURES.elena), null);
  const payload = db.prepare("SELECT payload_json FROM outbox WHERE event_type = 'portal.question' ORDER BY created_at DESC LIMIT 1").get() as { payload_json: string };
  assert.equal(payload.payload_json.includes("chest pain"), false);
  assert.equal(payload.payload_json.includes("Potassium"), false);
});

test("a request is not a booking, a recorded amount is not a charge, and replays stay local", () => {
  const { db, ctx } = signIn(FIXTURES.elenaPortal);
  const before = (db.prepare("SELECT COUNT(*) AS c FROM appointments").get() as { c: number }).c;
  const requested = requestAppointment(db, ctx, { reason: "Blood pressure check", idempotencyKey: "portal-req-00001" });
  assert.equal(requested.status, "requested");
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM appointments").get() as { c: number }).c, before);
  const jordan = clinician(db, FIXTURES.jordan);
  assert.throws(
    () => decideAppointmentRequest(db, jordan, { requestId: requested.requestId, decision: "accepted", startsAt: "2026-10-20T15:00:00.000Z", endsAt: "2026-10-20T15:20:00.000Z", idempotencyKey: "portal-dec-00001" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  const amira = clinician(db, FIXTURES.amira);
  const accepted = decideAppointmentRequest(db, amira, {
    requestId: requested.requestId,
    decision: "accepted",
    startsAt: "2026-10-20T15:00:00.000Z",
    endsAt: "2026-10-20T15:20:00.000Z",
    idempotencyKey: "portal-dec-00002",
  });
  assert.equal(accepted.status, "accepted");
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM appointments").get() as { c: number }).c, before + 1);
  decideAppointmentRequest(db, amira, {
    requestId: requested.requestId,
    decision: "accepted",
    startsAt: "2026-10-20T15:00:00.000Z",
    endsAt: "2026-10-20T15:20:00.000Z",
    idempotencyKey: "portal-dec-00002",
  });
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM appointments").get() as { c: number }).c, before + 1);
  const again = requestAppointment(db, ctx, { reason: "Blood pressure check", idempotencyKey: "portal-req-00002" });
  const mirrored = decideAppointmentRequest(db, amira, {
    requestId: again.requestId,
    decision: "accepted",
    startsAt: "2026-10-21T15:00:00.000Z",
    endsAt: "2026-10-21T15:20:00.000Z",
    appointmentId: "apt_foundation-mirror-0001",
    idempotencyKey: "portal-dec-00003",
  });
  assert.equal(mirrored.appointmentId, "apt_foundation-mirror-0001");
  assert.equal((db.prepare("SELECT id FROM appointments WHERE id = 'apt_foundation-mirror-0001'").get() as { id: string }).id, "apt_foundation-mirror-0001");
  assert.throws(() => storeCoverage(db, ctx, { payerName: "Harbor Plan", memberId: "4111111111111111", idempotencyKey: "portal-cov-00001" }), (error: unknown) => error instanceof ValidationError);
  storeCoverage(db, ctx, { payerName: "Harbor Plan", memberId: "HP-1001", idempotencyKey: "portal-cov-00002" });
  const payment = recordPatientPayment(db, ctx, { description: "Recorded visit amount", amountCents: 2500, idempotencyKey: "portal-pay-00001" });
  assert.equal(payment.status, "recorded");
  const row = db.prepare("SELECT status FROM patient_payments WHERE id = ?").get(payment.paymentId) as { status: string };
  assert.equal(row.status, "recorded");
  const desk = readPatientDesk(db, amira, FIXTURES.elena);
  assert.equal(desk?.coverage?.memberId, "HP-1001");
  assert.equal(desk?.payments[0]?.status, "recorded");
  const started = Date.now();
  for (let i = 0; i < 40; i += 1) {
    storePatientQuestion(db, ctx, { text: "What should I bring to the visit?", idempotencyKey: "portal-q-replay01" });
  }
  assert.ok(Date.now() - started < 3000);
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM patient_questions WHERE text = ?").get("What should I bring to the visit?") as { c: number }).c, 1);
  assert.throws(
    () => storePatientQuestion(db, ctx, { text: "A different question", idempotencyKey: "portal-q-replay01" }),
    (error: unknown) => error instanceof ConflictError,
  );
});
