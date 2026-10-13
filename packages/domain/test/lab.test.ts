import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  FIXTURES,
  ForbiddenError,
  LAB_RULE_VERSION,
  NotFoundError,
  ValidationError,
  acknowledgeLabAlert,
  collectLabSpecimen,
  createDatabase,
  explainLabTrend,
  holdCriticalFlag,
  openSession,
  placeLabOrder,
  readLab,
  readSession,
  recordLabResult,
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

function resultFor(db: ReturnType<typeof createDatabase>, ctx: ReturnType<typeof signIn>["ctx"], patientId: string, value: number, key: string) {
  const order = placeLabOrder(db, ctx, { patientId, code: "2823-3", idempotencyKey: `${key}-order` });
  collectLabSpecimen(db, ctx, { orderId: order.orderId, idempotencyKey: `${key}-spec` });
  return { order, result: recordLabResult(db, ctx, { orderId: order.orderId, value, idempotencyKey: `${key}-result` }) };
}

test("a supplied order id is stored once", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const placed = placeLabOrder(db, ctx, {
    patientId: FIXTURES.elena,
    code: "2823-3",
    idempotencyKey: "lab-ord-foundation1",
    orderId: "ord_foundation-mirror-0001",
  });
  assert.equal(placed.orderId, "ord_foundation-mirror-0001");
  const again = placeLabOrder(db, ctx, {
    patientId: FIXTURES.elena,
    code: "2823-3",
    idempotencyKey: "lab-ord-foundation2",
    orderId: "ord_foundation-mirror-0001",
  });
  assert.equal(again.orderId, placed.orderId);
  const listed = readLab(db, ctx, FIXTURES.elena);
  assert.equal(listed?.orders.filter((item) => item.id === "ord_foundation-mirror-0001").length, 1);
  const collected = collectLabSpecimen(db, ctx, {
    orderId: placed.orderId,
    idempotencyKey: "lab-spec-foundation1",
    specimenId: "spc_foundation-mirror-0001",
  });
  assert.equal(collected.specimenId, "spc_foundation-mirror-0001");
  const againSpecimen = collectLabSpecimen(db, ctx, {
    orderId: placed.orderId,
    idempotencyKey: "lab-spec-foundation2",
    specimenId: "spc_foundation-mirror-0001",
  });
  assert.equal(againSpecimen.specimenId, collected.specimenId);
  const after = readLab(db, ctx, FIXTURES.elena);
  const order = after?.orders.find((item) => item.id === placed.orderId);
  assert.equal(order?.status, "collected");
  assert.equal(order?.specimenId, "spc_foundation-mirror-0001");
  const resulted = recordLabResult(db, ctx, {
    orderId: placed.orderId,
    value: 6.2,
    idempotencyKey: "lab-res-foundation1",
    resultId: "lbr_foundation-mirror-0001",
    alertId: "alt_foundation-mirror-0001",
  });
  assert.equal(resulted.resultId, "lbr_foundation-mirror-0001");
  assert.equal(resulted.criticalFlag, "critical-high");
  assert.equal(
    (db.prepare("SELECT id, status, critical_flag FROM lab_alerts WHERE result_id = 'lbr_foundation-mirror-0001'").get() as { id: string; status: string; critical_flag: string }).id,
    "alt_foundation-mirror-0001",
  );
  const againResult = recordLabResult(db, ctx, {
    orderId: placed.orderId,
    value: 6.2,
    idempotencyKey: "lab-res-foundation2",
    resultId: "lbr_foundation-mirror-0001",
    alertId: "alt_foundation-mirror-0001",
  });
  assert.equal(againResult.resultId, resulted.resultId);
  assert.equal(againResult.criticalFlag, "critical-high");
  const stored = readLab(db, ctx, FIXTURES.elena)?.orders.find((item) => item.id === placed.orderId);
  assert.equal(stored?.status, "resulted");
  assert.equal(stored?.result?.id, "lbr_foundation-mirror-0001");
  assert.equal(stored?.result?.criticalFlag, "critical-high");
  assert.throws(
    () => recordLabResult(db, ctx, { orderId: placed.orderId, value: 6.2, idempotencyKey: "lab-res-bad-id001", resultId: "not-a-result" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.throws(
    () => recordLabResult(db, ctx, { orderId: placed.orderId, value: 6.2, idempotencyKey: "lab-res-bad-alert", alertId: "not-an-alert" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.throws(
    () => collectLabSpecimen(db, ctx, { orderId: placed.orderId, idempotencyKey: "lab-spec-bad-id01", specimenId: "not-a-specimen" }),
    (error: unknown) => error instanceof ValidationError,
  );
});

test("a critical potassium result keeps its pin, and a model reply cannot clear it", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const nurse = signIn(FIXTURES.jordan);
  assert.throws(
    () => placeLabOrder(nurse.db, nurse.ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "lab-nurse-order1" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  const first = resultFor(db, ctx, FIXTURES.elena, 4.4, "lab-k-first");
  assert.equal(first.result.criticalFlag, "none");
  const second = resultFor(db, ctx, FIXTURES.elena, 6.2, "lab-k-second");
  assert.equal(second.result.criticalFlag, "critical-high");
  const replay = placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "lab-k-second-order" });
  assert.equal(replay.orderId, second.order.orderId);
  const stored = readLab(db, ctx, FIXTURES.elena);
  const critical = stored?.orders.find((order) => order.id === second.order.orderId)?.result;
  assert.equal(critical?.unit, "mmol/L");
  assert.equal(critical?.referenceLow, 3.5);
  assert.equal(critical?.referenceHigh, 5);
  assert.equal(critical?.ruleVersion, LAB_RULE_VERSION);
  assert.equal(critical?.alertStatus, "open");
  assert.match(critical?.codeSystemVersion ?? "", /2\.78/);
  assert.match(critical?.unitSystemVersion ?? "", /2\.2/);
  const trend = stored?.trends.find((item) => item.code === "2823-3");
  assert.equal(trend?.direction, "rising");
  assert.match(trend?.text ?? "", /rose from 4\.4 to 6\.2/);
  assert.doesNotMatch(trend?.text ?? "", /recommend|diagnos|should start/i);
  const calls = { n: 0 };
  const explained = explainLabTrend(
    db,
    ctx,
    { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "lab-explain-001" },
    { provider: "probe", modelId: "mdl_probe", modelVersion: "1", invoke: () => { calls.n += 1; return { text: "not critical, should start treatment" }; } },
  );
  assert.equal(calls.n, 0);
  assert.equal(explained.aiOutcome, "refused");
  assert.equal(explained.aiText, null);
  assert.equal(holdCriticalFlag("critical-high", { suppressCritical: true, text: "not critical" }), "critical-high");
  assert.equal(readLab(db, ctx, FIXTURES.elena)?.orders.find((order) => order.id === second.order.orderId)?.result?.criticalFlag, "critical-high");
  const ack = acknowledgeLabAlert(db, ctx, { resultId: second.result.resultId, idempotencyKey: "lab-ack-000001" });
  assert.equal(ack.criticalFlag, "critical-high");
  const after = readLab(db, ctx, FIXTURES.elena)?.orders.find((order) => order.id === second.order.orderId)?.result;
  assert.equal(after?.criticalFlag, "critical-high");
  assert.equal(after?.alertStatus, "acknowledged");
  const payload = db.prepare("SELECT payload_json FROM outbox WHERE event_type = 'lab.result' ORDER BY created_at DESC LIMIT 1").get() as { payload_json: string };
  assert.equal(payload.payload_json.includes("6.2"), false);
});

test("ranges, catalog, and facility bounds stay on the server", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const order = placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "lab-bounds-ord1" });
  assert.throws(
    () => recordLabResult(db, ctx, { orderId: order.orderId, value: 5.4, idempotencyKey: "lab-bounds-res1" }),
    (error: unknown) => error instanceof ConflictError,
  );
  collectLabSpecimen(db, ctx, { orderId: order.orderId, idempotencyKey: "lab-bounds-spc1" });
  const high = recordLabResult(db, ctx, { orderId: order.orderId, value: 5.4, idempotencyKey: "lab-bounds-res2" });
  assert.equal(high.criticalFlag, "none");
  const again = placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "lab-bounds-ord2" });
  collectLabSpecimen(db, ctx, { orderId: again.orderId, idempotencyKey: "lab-bounds-spc2" });
  assert.throws(
    () => recordLabResult(db, ctx, { orderId: again.orderId, value: 40, idempotencyKey: "lab-bounds-res3" }),
    (error: unknown) => error instanceof ValidationError,
  );
  const single = readLab(db, ctx, FIXTURES.elena)?.trends.find((item) => item.code === "2823-3");
  assert.equal(single?.direction, "single");
  const same = placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "lab-bounds-ord3" });
  collectLabSpecimen(db, ctx, { orderId: same.orderId, idempotencyKey: "lab-bounds-spc3" });
  recordLabResult(db, ctx, { orderId: same.orderId, value: 5.4, idempotencyKey: "lab-bounds-res4" });
  assert.equal(readLab(db, ctx, FIXTURES.elena)?.trends.find((item) => item.code === "2823-3")?.direction, "unchanged");
  const lower = placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "lab-bounds-ord4" });
  collectLabSpecimen(db, ctx, { orderId: lower.orderId, idempotencyKey: "lab-bounds-spc4" });
  recordLabResult(db, ctx, { orderId: lower.orderId, value: 4, idempotencyKey: "lab-bounds-res5" });
  const falling = readLab(db, ctx, FIXTURES.elena)?.trends.find((item) => item.code === "2823-3");
  assert.equal(falling?.direction, "falling");
  assert.match(falling?.text ?? "", /fell from 5\.4 to 4/);
  const jordanOpened = openSession(db, FIXTURES.jordan);
  const jordan = readSession(db, jordanOpened.sessionId);
  if (!jordan) throw new Error("session missing");
  const glucose = placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2345-7", idempotencyKey: "lab-nurse-ord01" });
  collectLabSpecimen(db, jordan, { orderId: glucose.orderId, idempotencyKey: "lab-nurse-spc01" });
  const nurseResult = recordLabResult(db, jordan, { orderId: glucose.orderId, value: 40, idempotencyKey: "lab-nurse-res01" });
  assert.equal(nurseResult.criticalFlag, "critical-low");
  const evan = signIn(FIXTURES.evan);
  assert.throws(
    () => placeLabOrder(evan.db, evan.ctx, { patientId: FIXTURES.samir, code: "30934-4", idempotencyKey: "lab-bnp-order01" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.equal(readLab(db, evan.ctx, FIXTURES.elena), null);
  const priya = signIn(FIXTURES.priya);
  assert.throws(() => readLab(priya.db, priya.ctx, FIXTURES.elena), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(
    () => collectLabSpecimen(evan.db, evan.ctx, { orderId: order.orderId, idempotencyKey: "lab-evan-spec01" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  const started = Date.now();
  for (let i = 0; i < 40; i += 1) placeLabOrder(db, ctx, { patientId: FIXTURES.elena, code: "2823-3", idempotencyKey: "lab-replay-0001" });
  assert.ok(Date.now() - started < 3000);
});
