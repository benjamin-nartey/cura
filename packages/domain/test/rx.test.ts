import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  FIXTURES,
  ForbiddenError,
  FORMULARY_VERSION,
  MED_SAFETY_VERSION,
  NotFoundError,
  RX_SOURCE,
  ValidationError,
  acknowledgeRxWarning,
  activateRxOrder,
  administerRx,
  createDatabase,
  dispenseRx,
  explainRx,
  holdSafetyWarnings,
  openSession,
  prescribeMedication,
  readRx,
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

test("a high-risk allergy warning blocks the chart until it is acknowledged", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const nurse = signIn(FIXTURES.jordan);
  assert.throws(
    () => prescribeMedication(nurse.db, nurse.ctx, { patientId: FIXTURES.elena, formularyId: "frm_amoxicillin", dose: "500 mg", idempotencyKey: "rx-nurse-order1" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  const order = prescribeMedication(db, ctx, { patientId: FIXTURES.elena, formularyId: "frm_amoxicillin", dose: "500 mg", idempotencyKey: "rx-amox-order01" });
  const replay = prescribeMedication(db, ctx, { patientId: FIXTURES.elena, formularyId: "frm_amoxicillin", dose: "500 mg", idempotencyKey: "rx-amox-order01" });
  assert.equal(replay.orderId, order.orderId);
  const view = readRx(db, ctx, FIXTURES.elena);
  const stored = view?.orders.find((item) => item.id === order.orderId);
  const warning = stored?.warnings.find((item) => item.kind === "allergy");
  assert.equal(warning?.severity, "high");
  assert.equal(warning?.source, RX_SOURCE);
  assert.equal(warning?.ruleVersion, MED_SAFETY_VERSION);
  assert.equal(warning?.status, "open");
  assert.doesNotMatch(warning?.summary ?? "", /recommend|diagnos|should start/i);
  const mirrored = prescribeMedication(db, ctx, {
    patientId: FIXTURES.elena,
    formularyId: "frm_amoxicillin",
    dose: "500 mg",
    idempotencyKey: "rx-amox-mirror01",
    orderId: "rxo_foundation-mirror-0001",
    warningIds: ["rxw_foundation-mirror-0001"],
  });
  assert.equal(mirrored.orderId, "rxo_foundation-mirror-0001");
  const storedMirror = readRx(db, ctx, FIXTURES.elena)?.orders.find((item) => item.id === mirrored.orderId);
  assert.equal(storedMirror?.warnings[0]?.id, "rxw_foundation-mirror-0001");
  assert.equal(storedMirror?.warnings[0]?.ruleId, "alg_penicillin");
  const beforeMirror = (db.prepare("SELECT COUNT(*) AS c FROM rx_orders").get() as { c: number }).c;
  assert.throws(
    () =>
      prescribeMedication(db, ctx, {
        patientId: FIXTURES.elena,
        formularyId: "frm_amoxicillin",
        dose: "500 mg",
        idempotencyKey: "rx-amox-mirror02",
        orderId: "rxo_foundation-mirror-0002",
        warningIds: [],
      }),
    (error: unknown) => error instanceof ConflictError,
  );
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM rx_orders").get() as { c: number }).c, beforeMirror);
  assert.throws(
    () =>
      prescribeMedication(db, ctx, {
        patientId: FIXTURES.elena,
        formularyId: "frm_amoxicillin",
        dose: "500 mg",
        idempotencyKey: "rx-amox-mirror03",
        orderId: "not-an-order",
      }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.throws(
    () => activateRxOrder(db, ctx, { orderId: order.orderId, idempotencyKey: "rx-amox-act0001" }),
    (error: unknown) => error instanceof ConflictError,
  );
  const calls = { n: 0 };
  const explained = explainRx(
    db,
    ctx,
    { orderId: order.orderId, idempotencyKey: "rx-amox-explain1" },
    { provider: "probe", modelId: "mdl_probe", modelVersion: "1", invoke: () => { calls.n += 1; return { clear: true, text: "no allergy, should start" }; } },
  );
  assert.equal(calls.n, 0);
  assert.equal(explained.aiOutcome, "refused");
  assert.equal(explained.aiText, null);
  assert.equal(holdSafetyWarnings(explained.warnings, { clear: true }).find((item) => item.kind === "allergy")?.status, "open");
  assert.throws(
    () => activateRxOrder(db, ctx, { orderId: order.orderId, idempotencyKey: "rx-amox-act0002" }),
    (error: unknown) => error instanceof ConflictError,
  );
  if (!warning) throw new Error("warning missing");
  const ack = acknowledgeRxWarning(db, ctx, { warningId: warning.id, idempotencyKey: "rx-amox-ack0001" });
  assert.equal(ack.severity, "high");
  const meds = () => (db.prepare("SELECT COUNT(*) AS c FROM medications WHERE patient_id = ?").get(FIXTURES.elena) as { c: number }).c;
  const before = meds();
  const active = activateRxOrder(db, ctx, { orderId: order.orderId, idempotencyKey: "rx-amox-act0003" });
  assert.equal(meds(), before + 1);
  const row = db.prepare("SELECT display, dose, status FROM medications WHERE id = ?").get(active.medicationId) as { display: string; dose: string; status: string };
  assert.equal(row.display, "Amoxicillin");
  assert.equal(row.dose, "500 mg");
  assert.equal(row.status, "active");
  const jordan = readSession(db, openSession(db, FIXTURES.jordan).sessionId);
  if (!jordan) throw new Error("session missing");
  dispenseRx(db, jordan, { orderId: order.orderId, quantity: 5, idempotencyKey: "rx-amox-disp001" });
  administerRx(db, jordan, { orderId: order.orderId, idempotencyKey: "rx-amox-give001" });
  const after = readRx(db, ctx, FIXTURES.elena)?.orders.find((item) => item.id === order.orderId);
  assert.equal(after?.warnings.find((item) => item.kind === "allergy")?.severity, "high");
  assert.equal(after?.adherence.signal, "behind");
  assert.match(after?.adherence.text ?? "", /1 administration is stored against 5 dispensed units/);
  assert.doesNotMatch(after?.adherence.text ?? "", /recommend|diagnos|should start/i);
  const payload = db.prepare("SELECT payload_json FROM outbox WHERE event_type = 'rx.prescribe' ORDER BY created_at DESC LIMIT 1").get() as { payload_json: string };
  assert.equal(payload.payload_json.includes("Penicillin"), false);
  assert.equal(payload.payload_json.includes(MED_SAFETY_VERSION) || payload.payload_json.includes("frm_amoxicillin"), true);
});

test("duplicate therapy, interactions, and facility bounds stay on the server", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const duplicate = prescribeMedication(db, ctx, { patientId: FIXTURES.elena, formularyId: "frm_torsemide", dose: "10 mg", idempotencyKey: "rx-tor-order001" });
  const dupView = readRx(db, ctx, FIXTURES.elena)?.orders.find((item) => item.id === duplicate.orderId);
  assert.equal(dupView?.warnings[0]?.kind, "duplicate");
  assert.equal(dupView?.warnings[0]?.severity, "high");
  const warfarin = prescribeMedication(db, ctx, { patientId: FIXTURES.elena, formularyId: "frm_warfarin", dose: "5 mg", idempotencyKey: "rx-war-order001" });
  assert.equal(readRx(db, ctx, FIXTURES.elena)?.orders.find((item) => item.id === warfarin.orderId)?.warnings.length, 0);
  activateRxOrder(db, ctx, { orderId: warfarin.orderId, idempotencyKey: "rx-war-act00001", medicationId: "med_foundation-mirror-0001" });
  assert.equal((db.prepare("SELECT display, status FROM medications WHERE id = 'med_foundation-mirror-0001'").get() as { display: string; status: string }).display, "Warfarin");
  const given = administerRx(db, ctx, {
    orderId: warfarin.orderId,
    idempotencyKey: "rx-war-give0001",
    administrationId: "rxa_foundation-mirror-0001",
  });
  assert.equal(given.administrationId, "rxa_foundation-mirror-0001");
  const again = administerRx(db, ctx, {
    orderId: warfarin.orderId,
    idempotencyKey: "rx-war-give0002",
    administrationId: "rxa_foundation-mirror-0001",
  });
  assert.equal(again.administrationId, "rxa_foundation-mirror-0001");
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM rx_administrations WHERE id = 'rxa_foundation-mirror-0001'").get() as { c: number }).c, 1);
  assert.throws(
    () => administerRx(db, ctx, { orderId: warfarin.orderId, idempotencyKey: "rx-war-give0003", administrationId: "not-an-administration" }),
    (error: unknown) => error instanceof ValidationError,
  );
  const ibuprofen = prescribeMedication(db, ctx, { patientId: FIXTURES.elena, formularyId: "frm_ibuprofen", dose: "200 mg", idempotencyKey: "rx-ibu-order001" });
  const ibu = readRx(db, ctx, FIXTURES.elena)?.orders.find((item) => item.id === ibuprofen.orderId);
  assert.equal(ibu?.warnings.some((item) => item.kind === "interaction" && item.severity === "high" && item.ruleVersion === MED_SAFETY_VERSION), true);
  assert.equal(ibu?.warnings.some((item) => item.kind === "formulary" && item.severity === "moderate" && item.summary.includes(FORMULARY_VERSION)), true);
  const interaction = ibu?.warnings.find((item) => item.kind === "interaction");
  if (!interaction) throw new Error("interaction missing");
  acknowledgeRxWarning(db, ctx, { warningId: interaction.id, idempotencyKey: "rx-ibu-ack00001" });
  activateRxOrder(db, ctx, { orderId: ibuprofen.orderId, idempotencyKey: "rx-ibu-act00001" });
  assert.throws(
    () => dispenseRx(db, ctx, { orderId: duplicate.orderId, quantity: 1, idempotencyKey: "rx-tor-disp0001" }),
    (error: unknown) => error instanceof ConflictError,
  );
  assert.throws(
    () => administerRx(db, ctx, { orderId: ibuprofen.orderId, idempotencyKey: "rx-ibu-give0001", administrationId: "rxa_foundation-mirror-0001" }),
    (error: unknown) => error instanceof ConflictError,
  );
  assert.throws(
    () => dispenseRx(db, ctx, { orderId: warfarin.orderId, quantity: 0, idempotencyKey: "rx-war-disp0001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  const mirrored = dispenseRx(db, ctx, {
    orderId: warfarin.orderId,
    quantity: 2,
    idempotencyKey: "rx-war-disp0002",
    dispenseId: "rxd_foundation-mirror-0001",
  });
  assert.equal(mirrored.dispenseId, "rxd_foundation-mirror-0001");
  assert.equal((db.prepare("SELECT quantity, order_id FROM rx_dispenses WHERE id = 'rxd_foundation-mirror-0001'").get() as { quantity: number; order_id: string }).quantity, 2);
  assert.equal((db.prepare("SELECT status FROM rx_orders WHERE id = ?").get(warfarin.orderId) as { status: string }).status, "dispensed");
  assert.throws(
    () =>
      dispenseRx(db, ctx, {
        orderId: warfarin.orderId,
        quantity: 3,
        idempotencyKey: "rx-war-disp0003",
        dispenseId: "rxd_foundation-mirror-0001",
      }),
    (error: unknown) => error instanceof ConflictError,
  );
  assert.equal((db.prepare("SELECT COUNT(*) AS c FROM rx_dispenses WHERE id = 'rxd_foundation-mirror-0001'").get() as { c: number }).c, 1);
  assert.throws(
    () => dispenseRx(db, ctx, { orderId: warfarin.orderId, quantity: 1, idempotencyKey: "rx-war-disp0004", dispenseId: "not-a-dispense" }),
    (error: unknown) => error instanceof ValidationError,
  );
  const evan = signIn(FIXTURES.evan);
  assert.equal(readRx(db, evan.ctx, FIXTURES.elena), null);
  const priya = signIn(FIXTURES.priya);
  assert.throws(() => readRx(priya.db, priya.ctx, FIXTURES.elena), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(
    () => acknowledgeRxWarning(evan.db, evan.ctx, { warningId: interaction.id, idempotencyKey: "rx-evan-ack0001" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  const started = Date.now();
  for (let i = 0; i < 40; i += 1) {
    prescribeMedication(db, ctx, { patientId: FIXTURES.elena, formularyId: "frm_metformin", dose: "500 mg", idempotencyKey: "rx-replay-00001" });
  }
  assert.ok(Date.now() - started < 3000);
});
