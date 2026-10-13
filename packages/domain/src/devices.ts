import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { interpretEntry } from "./catalog";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";
import { canReadChart } from "./session";
import { resolveFacilityConcept } from "./terminology";

export const DEVICE_NORM_VERSION = "device-norm-2026.10";
export const DEVICE_ALERT_VERSION = "device-alert-2026.10";
export const DEVICE_ALERT_BUDGET = 3;
export const DEVICE_KINDS = {
  "pulse-oximeter": "59408-5",
  "blood-pressure-cuff": "8480-6",
  "glucose-meter": "2345-7",
} as const;
export const DEVICE_CONNECTIVITY_NOTE = "No device stream is connected. Readings are typed into the record.";
export const DEVICE_ALERT_NOTE = "This is a stored threshold mark. No page was sent.";
export const DEVICE_ESCALATION_NOTE = "The alert budget of 3 is spent. This reading is stored. No page was sent.";
export const DEVICE_AI_NOTE = "No device reading was interpreted. This is not an alarm from a connected device.";

export type DeviceKind = keyof typeof DEVICE_KINDS;

export type DeviceReading = {
  id: string;
  code: string;
  display: string;
  value: number;
  unit: string;
  effectiveAt: string;
  receivedAt: string;
  order: "in-order" | "out-of-order";
  authorId: string;
  normalizationVersion: string;
};

export type DeviceAlert = {
  id: string;
  readingId: string;
  status: "open" | "acknowledged";
  note: string;
  createdAt: string;
};

export type DeviceEscalation = {
  id: string;
  readingId: string;
  note: string;
  createdAt: string;
};

export type DeviceRecord = {
  id: string;
  patientId: string;
  kind: DeviceKind;
  label: string;
  connectivity: "not-connected";
  connectivityNote: string;
  createdAt: string;
  readings: DeviceReading[];
  alerts: DeviceAlert[];
  escalations: DeviceEscalation[];
};

export type DeviceView = {
  normalizationVersion: string;
  alertVersion: string;
  alertBudget: number;
  connectivityNote: string;
  aiNote: string;
  devices: DeviceRecord[];
};

export function holdDeviceText(text: string, _aiOutput: unknown) {
  return text;
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function facilityOf(db: AppDatabase, ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "device.read", resourceType: "Device", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
  return ctx.facilityId;
}

function kindOf(value: string): DeviceKind {
  if (value === "pulse-oximeter" || value === "blood-pressure-cuff" || value === "glucose-meter") return value;
  throw new ValidationError("code", "That device kind is not in the pin.");
}

function labelOf(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 40) throw new ValidationError();
  return trimmed;
}

function effectiveAtOf(value: string, now: Date) {
  const trimmed = value.trim();
  let iso = trimmed;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) iso = `${trimmed}:00.000Z`;
  else if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(trimmed)) iso = `${trimmed}.000Z`;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) throw new ValidationError("invalid", "Use a reading time.");
  if (parsed.getTime() > now.getTime() + 24 * 60 * 60 * 1000) throw new ValidationError("range", "That reading time is too far ahead.");
  return parsed.toISOString();
}

function requirePatient(db: AppDatabase, ctx: SessionContext, patientId: string, facilityId: string) {
  const patient = get<{ id: string }>(
    db,
    `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    patientId,
    ctx.organizationId,
    facilityId,
  );
  if (!patient) throw new NotFoundError();
}

function replay<T>(db: AppDatabase, ctx: SessionContext, key: string, hash: string): T | undefined {
  const row = get<{ request_hash: string; response_json: string }>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    ctx.organizationId,
    key,
  );
  if (!row) return undefined;
  if (row.request_hash !== hash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  return JSON.parse(row.response_json) as T;
}

function saveKey(db: AppDatabase, ctx: SessionContext, key: string, hash: string, body: unknown, now: string) {
  execute(
    db,
    `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ctx.organizationId,
    key,
    ctx.userId,
    hash,
    JSON.stringify(body),
    now,
  );
}

function publish(db: AppDatabase, ctx: SessionContext, eventType: string, payload: Record<string, string>, now: string) {
  execute(
    db,
    `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    ctx.organizationId,
    eventType,
    JSON.stringify(payload),
    now,
  );
}

type DeviceRow = {
  id: string;
  patient_id: string;
  kind: DeviceKind;
  label: string;
  created_at: string;
};

function loadDevice(db: AppDatabase, ctx: SessionContext, facilityId: string, deviceId: string) {
  const row = get<DeviceRow>(
    db,
    `SELECT id, patient_id, kind, label, created_at FROM devices WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    deviceId,
    ctx.organizationId,
    facilityId,
  );
  if (!row) throw new NotFoundError();
  return row;
}

export function readDevices(db: AppDatabase, ctx: SessionContext): DeviceView {
  const facilityId = facilityOf(db, ctx);
  writeAudit(db, ctx, { action: "device.read", resourceType: "Device", resourceId: facilityId, outcome: "success" });
  const devices = all<DeviceRow>(
    db,
    `SELECT id, patient_id, kind, label, created_at FROM devices WHERE organization_id = ? AND facility_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
    facilityId,
  );
  const readings = all<{
    id: string;
    device_id: string;
    code: string;
    display: string;
    value: number;
    unit: string;
    effective_at: string;
    received_at: string;
    order_flag: "in-order" | "out-of-order";
    author_id: string;
    normalization_version: string;
  }>(
    db,
    `SELECT id, device_id, code, display, value, unit, effective_at, received_at, order_flag, author_id, normalization_version
     FROM device_readings WHERE organization_id = ? AND facility_id = ? ORDER BY effective_at, id`,
    ctx.organizationId,
    facilityId,
  );
  const alerts = all<{ id: string; reading_id: string; status: "open" | "acknowledged"; created_at: string; device_id: string }>(
    db,
    `SELECT a.id, a.reading_id, a.status, a.created_at, r.device_id
     FROM device_alerts a JOIN device_readings r ON r.id = a.reading_id
     WHERE a.organization_id = ? AND a.facility_id = ? ORDER BY a.created_at, a.id`,
    ctx.organizationId,
    facilityId,
  );
  const escalations = all<{ id: string; reading_id: string; note: string; created_at: string; device_id: string }>(
    db,
    `SELECT e.id, e.reading_id, e.note, e.created_at, r.device_id
     FROM device_escalations e JOIN device_readings r ON r.id = e.reading_id
     WHERE e.organization_id = ? AND e.facility_id = ? ORDER BY e.created_at, e.id`,
    ctx.organizationId,
    facilityId,
  );
  return {
    normalizationVersion: DEVICE_NORM_VERSION,
    alertVersion: DEVICE_ALERT_VERSION,
    alertBudget: DEVICE_ALERT_BUDGET,
    connectivityNote: DEVICE_CONNECTIVITY_NOTE,
    aiNote: DEVICE_AI_NOTE,
    devices: devices.map((device) => ({
      id: device.id,
      patientId: device.patient_id,
      kind: device.kind,
      label: device.label,
      connectivity: "not-connected",
      connectivityNote: DEVICE_CONNECTIVITY_NOTE,
      createdAt: device.created_at,
      readings: readings
        .filter((reading) => reading.device_id === device.id)
        .map((reading) => ({
          id: reading.id,
          code: reading.code,
          display: reading.display,
          value: reading.value,
          unit: reading.unit,
          effectiveAt: reading.effective_at,
          receivedAt: reading.received_at,
          order: reading.order_flag,
          authorId: reading.author_id,
          normalizationVersion: reading.normalization_version,
        })),
      alerts: alerts
        .filter((alert) => alert.device_id === device.id)
        .map((alert) => ({
          id: alert.id,
          readingId: alert.reading_id,
          status: alert.status,
          note: DEVICE_ALERT_NOTE,
          createdAt: alert.created_at,
        })),
      escalations: escalations
        .filter((item) => item.device_id === device.id)
        .map((item) => ({ id: item.id, readingId: item.reading_id, note: item.note, createdAt: item.created_at })),
    })),
  };
}

export function registerDevice(
  db: AppDatabase,
  ctx: SessionContext,
  input: { patientId: string; kind: string; label: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(db, ctx);
  requirePatient(db, ctx, input.patientId, facilityId);
  const kind = kindOf(input.kind);
  const code = DEVICE_KINDS[kind];
  if (!resolveFacilityConcept(db, facilityId, code)) throw new ValidationError("code", "That code is not in this facility catalog.");
  const label = labelOf(input.label);
  const hash = canonicalHash({ patientId: input.patientId, kind, label });
  const prior = replay<{ deviceId: string }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const deviceId = `dev_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { deviceId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO devices (id, organization_id, facility_id, patient_id, kind, label, connectivity, author_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'not-connected', ?, ?)`,
      deviceId,
      ctx.organizationId,
      facilityId,
      input.patientId,
      kind,
      label,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "device.registered", { deviceId }, now);
    writeAudit(db, ctx, { action: "device.register", resourceType: "Device", resourceId: deviceId, outcome: "success" });
  });
  return saved;
}

export function prepareDeviceReading(
  db: AppDatabase,
  ctx: SessionContext,
  input: { deviceId: string; value: number; effectiveAt: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(db, ctx);
  const device = loadDevice(db, ctx, facilityId, input.deviceId);
  const code = DEVICE_KINDS[device.kind];
  const concept = resolveFacilityConcept(db, facilityId, code);
  if (!concept) throw new ValidationError("code");
  if (!Number.isFinite(input.value) || input.value < concept.min || input.value > concept.max) throw new ValidationError("range");
  return { patientId: device.patient_id, code, value: input.value, effectiveAt: effectiveAtOf(input.effectiveAt, new Date()) };
}

export function recordDeviceReading(
  db: AppDatabase,
  ctx: SessionContext,
  input: { deviceId: string; value: number; effectiveAt: string; idempotencyKey: string },
) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(db, ctx);
  const device = loadDevice(db, ctx, facilityId, input.deviceId);
  const concept = resolveFacilityConcept(db, facilityId, DEVICE_KINDS[device.kind]);
  if (!concept) throw new ValidationError("code");
  if (!Number.isFinite(input.value) || input.value < concept.min || input.value > concept.max) throw new ValidationError("range");
  const nowDate = new Date();
  const effectiveAt = effectiveAtOf(input.effectiveAt, nowDate);
  const hash = canonicalHash({ deviceId: device.id, value: input.value, effectiveAt });
  const prior = replay<{ readingId: string; duplicate: boolean; order: "in-order" | "out-of-order"; alertId: string | null; escalationId: string | null }>(
    db,
    ctx,
    input.idempotencyKey,
    hash,
  );
  if (prior) return prior;
  const existing = get<{ id: string; value: number }>(
    db,
    `SELECT id, value FROM device_readings WHERE device_id = ? AND code = ? AND effective_at = ?`,
    device.id,
    concept.code,
    effectiveAt,
  );
  if (existing && existing.value !== input.value) {
    throw new ConflictError("conflict", "That time already has a different reading.");
  }
  const later = get<{ id: string }>(
    db,
    `SELECT id FROM device_readings WHERE device_id = ? AND code = ? AND effective_at > ? LIMIT 1`,
    device.id,
    concept.code,
    effectiveAt,
  );
  const order = later ? "out-of-order" : "in-order";
  const outside = (concept.low !== null && input.value < concept.low) || (concept.high !== null && input.value > concept.high);
  const now = nowDate.toISOString();
  if (existing) {
    const saved = { readingId: existing.id, duplicate: true, order, alertId: null, escalationId: null };
    transaction(db, () => {
      saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
      writeAudit(db, ctx, { action: "device.reading", resourceType: "DeviceReading", resourceId: existing.id, outcome: "success" });
    });
    return saved;
  }
  const readingId = `dvr_${randomUUID()}`;
  const openRow = get<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM device_alerts WHERE organization_id = ? AND facility_id = ? AND patient_id = ? AND status = 'open'`,
    ctx.organizationId,
    facilityId,
    device.patient_id,
  );
  const openCount = Number(openRow?.c ?? 0);
  const alertId = order === "in-order" && outside && openCount < DEVICE_ALERT_BUDGET ? `dva_${randomUUID()}` : null;
  const escalationId = order === "in-order" && outside && openCount >= DEVICE_ALERT_BUDGET ? `dve_${randomUUID()}` : null;
  const saved = { readingId, duplicate: false, order, alertId, escalationId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO device_readings (
         id, organization_id, facility_id, device_id, patient_id, code, display, value, unit,
         code_system_version, unit_system_version, binding_version, normalization_version,
         effective_at, received_at, order_flag, author_id
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      readingId,
      ctx.organizationId,
      facilityId,
      device.id,
      device.patient_id,
      concept.code,
      concept.display,
      input.value,
      concept.unit,
      concept.codeSystemVersion,
      concept.unitSystemVersion,
      concept.bindingVersion,
      DEVICE_NORM_VERSION,
      effectiveAt,
      now,
      order,
      ctx.userId,
    );
    if (alertId) {
      execute(
        db,
        `INSERT INTO device_alerts (id, organization_id, facility_id, patient_id, reading_id, status, rule_version, author_id, created_at)
         VALUES (?, ?, ?, ?, ?, 'open', ?, ?, ?)`,
        alertId,
        ctx.organizationId,
        facilityId,
        device.patient_id,
        readingId,
        DEVICE_ALERT_VERSION,
        ctx.userId,
        now,
      );
      publish(db, ctx, "device.alert", { alertId, readingId }, now);
    }
    if (escalationId) {
      execute(
        db,
        `INSERT INTO device_escalations (id, organization_id, facility_id, patient_id, reading_id, budget, note, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        escalationId,
        ctx.organizationId,
        facilityId,
        device.patient_id,
        readingId,
        DEVICE_ALERT_BUDGET,
        DEVICE_ESCALATION_NOTE,
        now,
      );
      publish(db, ctx, "device.escalation", { escalationId, readingId }, now);
    }
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "device.reading", { readingId, order }, now);
    writeAudit(db, ctx, { action: "device.reading", resourceType: "DeviceReading", resourceId: readingId, outcome: "success" });
  });
  return saved;
}

export function acknowledgeDeviceAlert(db: AppDatabase, ctx: SessionContext, input: { alertId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(db, ctx);
  const hash = canonicalHash({ alertId: input.alertId });
  const prior = replay<{ alertId: string; status: "acknowledged" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const alert = get<{ id: string; status: string }>(
    db,
    `SELECT id, status FROM device_alerts WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    input.alertId,
    ctx.organizationId,
    facilityId,
  );
  if (!alert) throw new NotFoundError();
  if (alert.status !== "open") throw new ConflictError("open", "That alert is already acknowledged.");
  const now = new Date().toISOString();
  const saved = { alertId: alert.id, status: "acknowledged" as const };
  transaction(db, () => {
    const changed = execute(
      db,
      `UPDATE device_alerts SET status = 'acknowledged', acknowledged_at = ? WHERE id = ? AND status = 'open'`,
      now,
      alert.id,
    );
    if (changed.changes !== 1) throw new ConflictError("open", "That alert is already acknowledged.");
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "device.acknowledged", { alertId: alert.id }, now);
    writeAudit(db, ctx, { action: "device.acknowledge", resourceType: "DeviceAlert", resourceId: alert.id, outcome: "success" });
  });
  return saved;
}

export function deviceMeasurementsWithoutObservation(
  db: AppDatabase,
  organizationId: string,
  facilityId: string,
  patientId: string,
) {
  const rows = all<{
    id: string;
    code: string;
    display: string;
    value: number;
    unit: string;
    effective_at: string;
    author_name: string;
  }>(
    db,
    `SELECT r.id, r.code, r.display, r.value, r.unit, r.effective_at, u.display_name AS author_name
     FROM device_readings r
     JOIN users u ON u.id = r.author_id
     WHERE r.patient_id = ? AND r.organization_id = ? AND r.facility_id = ?
       AND NOT EXISTS (
         SELECT 1 FROM observations o
         WHERE o.patient_id = r.patient_id
           AND o.organization_id = r.organization_id
           AND o.facility_id = r.facility_id
           AND o.code = r.code
           AND o.value = r.value
           AND o.effective_at = r.effective_at
       )
     ORDER BY r.effective_at DESC`,
    patientId,
    organizationId,
    facilityId,
  );
  return rows.flatMap((row) => {
    const concept = resolveFacilityConcept(db, facilityId, row.code);
    if (!concept) return [];
    const judged = interpretEntry(concept, row.value);
    return [
      {
        id: row.id,
        code: row.code,
        display: row.display,
        value: row.value,
        unit: row.unit,
        interpretation: judged.interpretation,
        thresholdText: judged.thresholdText,
        effectiveAt: row.effective_at,
        authorName: row.author_name,
      },
    ];
  });
}

export function explainDevice(
  db: AppDatabase,
  ctx: SessionContext,
  input: { deviceId: string; idempotencyKey: string },
  adapter?: GatewayAdapter,
) {
  assertKey(input.idempotencyKey);
  const facilityId = facilityOf(db, ctx);
  loadDevice(db, ctx, facilityId, input.deviceId);
  const gateway = invokeGateway(
    db,
    ctx,
    {
      promptId: GATEWAY_PROMPT.id,
      promptVersion: GATEWAY_PROMPT.version,
      text: "Interpret the stored device reading.",
      idempotencyKey: input.idempotencyKey,
    },
    adapter,
  );
  writeAudit(db, ctx, { action: "device.explain", resourceType: "Device", resourceId: input.deviceId, outcome: "success" });
  return {
    deviceId: input.deviceId,
    text: holdDeviceText(DEVICE_AI_NOTE, gateway.output),
    aiOutcome: gateway.outcome,
    aiText: null,
  };
}
