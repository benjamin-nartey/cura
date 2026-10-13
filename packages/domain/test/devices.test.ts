import assert from "node:assert/strict";
import test from "node:test";
import {
  ConflictError,
  DEVICE_ALERT_BUDGET,
  DEVICE_ALERT_NOTE,
  DEVICE_AI_NOTE,
  DEVICE_CONNECTIVITY_NOTE,
  DEVICE_ESCALATION_NOTE,
  FIXTURES,
  ForbiddenError,
  NotFoundError,
  createDatabase,
  explainDevice,
  getChart,
  holdDeviceText,
  mirrorObservation,
  openPatientSession,
  openSession,
  readDevices,
  readPatientSession,
  readPortal,
  readSession,
  recordDeviceReading,
  registerDevice,
  acknowledgeDeviceAlert,
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

function session(db: ReturnType<typeof createDatabase>, userId: string) {
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return ctx;
}

test("a typed reading keeps provenance, and a duplicate or older time does not open another alert", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const chart = getChart(db, ctx, FIXTURES.elena);
  assert.ok(chart);
  const before = chart.observations.length;
  const registered = registerDevice(db, ctx, {
    patientId: FIXTURES.elena,
    kind: "pulse-oximeter",
    label: "Bedside cuff label",
    idempotencyKey: "dev-reg-0001",
  });
  const again = registerDevice(db, ctx, {
    patientId: FIXTURES.elena,
    kind: "pulse-oximeter",
    label: "Bedside cuff label",
    idempotencyKey: "dev-reg-0001",
  });
  assert.equal(again.deviceId, registered.deviceId);
  const view = readDevices(db, ctx);
  assert.equal(view.devices[0]?.connectivity, "not-connected");
  assert.equal(view.connectivityNote, DEVICE_CONNECTIVITY_NOTE);
  const first = recordDeviceReading(db, ctx, {
    deviceId: registered.deviceId,
    value: 90,
    effectiveAt: "2026-10-08T10:00:00.000Z",
    idempotencyKey: "dev-read-0001",
  });
  assert.equal(first.order, "in-order");
  assert.ok(first.alertId);
  const duplicate = recordDeviceReading(db, ctx, {
    deviceId: registered.deviceId,
    value: 90,
    effectiveAt: "2026-10-08T10:00:00.000Z",
    idempotencyKey: "dev-read-0002",
  });
  assert.equal(duplicate.duplicate, true);
  assert.equal(duplicate.readingId, first.readingId);
  assert.throws(
    () =>
      recordDeviceReading(db, ctx, {
        deviceId: registered.deviceId,
        value: 91,
        effectiveAt: "2026-10-08T10:00:00.000Z",
        idempotencyKey: "dev-read-0003",
      }),
    (error: unknown) => error instanceof ConflictError,
  );
  const older = recordDeviceReading(db, ctx, {
    deviceId: registered.deviceId,
    value: 88,
    effectiveAt: "2026-10-08T09:00:00.000Z",
    idempotencyKey: "dev-read-0004",
  });
  assert.equal(older.order, "out-of-order");
  assert.equal(older.alertId, null);
  const listed = readDevices(db, ctx).devices[0];
  assert.equal(listed?.readings.length, 2);
  assert.equal(listed?.alerts.length, 1);
  assert.equal(listed?.alerts[0]?.note, DEVICE_ALERT_NOTE);
  assert.equal(listed?.readings[0]?.unit, "%");
  assert.equal(listed?.readings[0]?.authorId, FIXTURES.amira);
  const after = getChart(db, ctx, FIXTURES.elena);
  assert.ok(after);
  assert.equal(after.observations.length, before);
  assert.throws(() => readDevices(db, session(db, FIXTURES.priya)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(
    () =>
      registerDevice(db, session(db, FIXTURES.evan), {
        patientId: FIXTURES.elena,
        kind: "pulse-oximeter",
        label: "Other site",
        idempotencyKey: "dev-reg-0002",
      }),
    (error: unknown) => error instanceof NotFoundError,
  );
});

test("the alert budget escalates instead of opening another mark", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const registered = registerDevice(db, ctx, {
    patientId: FIXTURES.elena,
    kind: "pulse-oximeter",
    label: "Overnight",
    idempotencyKey: "dev-reg-0003",
  });
  const opened: string[] = [];
  for (let index = 0; index < DEVICE_ALERT_BUDGET; index += 1) {
    const stored = recordDeviceReading(db, ctx, {
      deviceId: registered.deviceId,
      value: 90,
      effectiveAt: `2026-10-08T1${index}:00:00.000Z`,
      idempotencyKey: `dev-budget-${index}01`,
    });
    assert.ok(stored.alertId);
    opened.push(stored.alertId);
  }
  const spent = recordDeviceReading(db, ctx, {
    deviceId: registered.deviceId,
    value: 89,
    effectiveAt: "2026-10-08T15:00:00.000Z",
    idempotencyKey: "dev-budget-0401",
  });
  assert.equal(spent.alertId, null);
  assert.ok(spent.escalationId);
  const escalated = readDevices(db, ctx).devices[0];
  assert.equal(escalated?.alerts.length, DEVICE_ALERT_BUDGET);
  assert.equal(escalated?.escalations[0]?.note, DEVICE_ESCALATION_NOTE);
  acknowledgeDeviceAlert(db, ctx, { alertId: opened[0] ?? "", idempotencyKey: "dev-ack-0001" });
  const next = recordDeviceReading(db, ctx, {
    deviceId: registered.deviceId,
    value: 88,
    effectiveAt: "2026-10-08T16:00:00.000Z",
    idempotencyKey: "dev-budget-0501",
  });
  assert.ok(next.alertId);
  const explained = explainDevice(
    db,
    ctx,
    { deviceId: registered.deviceId, idempotencyKey: "dev-exp-0001" },
    { provider: "local", modelId: "mdl_none", modelVersion: "0", invoke: () => ({ alarm: "page now" }) },
  );
  assert.equal(explained.aiOutcome, "refused");
  assert.equal(explained.aiText, null);
  assert.equal(explained.text, holdDeviceText(DEVICE_AI_NOTE, "page now"));
});

test("a device reading stays on the sqlite timeline and the patient record until an observation is stored", () => {
  const { db, ctx } = signIn(FIXTURES.amira);
  const registered = registerDevice(db, ctx, {
    patientId: FIXTURES.elena,
    kind: "pulse-oximeter",
    label: "Bedside",
    idempotencyKey: "dev-reg-portal",
  });
  const stored = recordDeviceReading(db, ctx, {
    deviceId: registered.deviceId,
    value: 90,
    effectiveAt: "2026-10-08T10:00:00.000Z",
    idempotencyKey: "dev-read-portal",
  });
  const chart = getChart(db, ctx, FIXTURES.elena);
  if (!chart) throw new Error("chart missing");
  const event = chart.timeline.find((item) => item.sourceId === stored.readingId);
  assert.equal(event?.sourceTable, "device_readings");
  assert.equal(event?.kind, "observation");
  assert.match(event?.title ?? "", /Oxygen saturation · 90 %/);
  assert.equal(event?.abnormal, true);
  assert.equal(chart.observations.some((item) => item.id === stored.readingId), false);
  const patient = readPatientSession(db, openPatientSession(db, FIXTURES.elenaPortal).sessionId);
  if (!patient) throw new Error("patient session missing");
  const visible = readPortal(db, patient).results.filter((item) => item.display === "Oxygen saturation" && item.value === 90);
  assert.equal(visible.length, 1);
  assert.match(visible[0]?.explanation ?? "", /not a diagnosis/);
  mirrorObservation(db, ctx, {
    id: "obs_foundation-device-0001",
    patientId: FIXTURES.elena,
    code: "59408-5",
    display: "Oxygen saturation",
    value: 90,
    unit: "%",
    codeSystem: "http://loinc.org",
    codeSystemVersion: "2.78",
    unitSystemVersion: "2.2",
    bindingVersion: "facility-vitals-2026.10",
    interpretation: "low",
    thresholdText: "below 94 %",
    effectiveAt: "2026-10-08T10:00:00.000Z",
  });
  const copied = getChart(db, ctx, FIXTURES.elena);
  if (!copied) throw new Error("chart missing");
  assert.equal(copied.timeline.some((item) => item.sourceTable === "device_readings"), false);
  assert.ok(copied.observations.some((item) => item.id === "obs_foundation-device-0001"));
  const once = readPortal(db, patient).results.filter((item) => item.display === "Oxygen saturation" && item.value === 90);
  assert.equal(once.length, 1);
});
