import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";
import { canReadChart } from "./session";

export const FACILITY_SLA_VERSION = "facility-sla-2026.10";

const SLA_SECONDS = {
  appointments: 15 * 60,
  queue: 15 * 60,
  "lab-backlog": 15 * 60,
  pharmacy: 15 * 60,
  beds: 60 * 60,
  staffing: 60 * 60,
  equipment: 60 * 60,
  capacity: 60 * 60,
} as const;

const SOURCE_EVENTS = ["lab.order", "lab.result", "rx.prescribe", "rx.activate", "facility.bed", "facility.shift", "facility.equipment"] as const;

export type FacilitySignalKind = keyof typeof SLA_SECONDS;

export type FacilitySignal = {
  kind: FacilitySignalKind;
  sourceTable: string;
  count: number;
  sourceAt: string | null;
  slaSeconds: number;
  slaVersion: string;
  fresh: boolean;
  text: string;
};

export type FacilityBody = {
  signals: FacilitySignal[];
};

export type FacilityView = {
  facilityId: string;
  built: boolean;
  version: number;
  builtAt: string | null;
  sourceHash: string | null;
  currentSourceHash: string;
  stale: boolean;
  eventsPending: boolean;
  state: FacilityBody | null;
};

type SourceSnapshot = {
  appointments: { id: string; status: string; startsAt: string }[];
  queue: { id: string; status: string; startedAt: string }[];
  labs: { id: string; status: string; createdAt: string }[];
  pharmacy: { id: string; status: string; createdAt: string }[];
  beds: { id: string; label: string; status: string; patientId: string | null; version: number; recordedAt: string }[];
  shifts: { id: string; userId: string; status: string; startsAt: string; endsAt: string; recordedAt: string }[];
  equipment: { id: string; label: string; status: string; recordedAt: string }[];
};

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function clean(value: string, min: number, max: number) {
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new ValidationError();
  return trimmed;
}

function instant(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) throw new ValidationError();
  return new Date(parsed).toISOString();
}

function facilityOf(ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx) || ctx.role === "patient") throw new ForbiddenError();
  return ctx.facilityId;
}

function latest(values: string[]) {
  if (values.length === 0) return null;
  return values.slice().sort().at(-1) ?? null;
}

function loadSources(db: AppDatabase, organizationId: string, facilityId: string): SourceSnapshot {
  return {
    appointments: all<{ id: string; status: string; starts_at: string }>(
      db,
      `SELECT id, status, starts_at FROM appointments WHERE organization_id = ? AND facility_id = ? AND status = 'booked' ORDER BY id`,
      organizationId,
      facilityId,
    ).map((row) => ({ id: row.id, status: row.status, startsAt: row.starts_at })),
    queue: all<{ id: string; status: string; started_at: string }>(
      db,
      `SELECT id, status, started_at FROM encounters WHERE organization_id = ? AND facility_id = ? AND status = 'in-progress' ORDER BY id`,
      organizationId,
      facilityId,
    ).map((row) => ({ id: row.id, status: row.status, startedAt: row.started_at })),
    labs: all<{ id: string; status: string; created_at: string }>(
      db,
      `SELECT id, status, created_at FROM lab_orders WHERE organization_id = ? AND facility_id = ? AND status IN ('requested','collected') ORDER BY id`,
      organizationId,
      facilityId,
    ).map((row) => ({ id: row.id, status: row.status, createdAt: row.created_at })),
    pharmacy: all<{ id: string; status: string; created_at: string }>(
      db,
      `SELECT id, status, created_at FROM rx_orders WHERE organization_id = ? AND facility_id = ? AND status IN ('proposed','active') ORDER BY id`,
      organizationId,
      facilityId,
    ).map((row) => ({ id: row.id, status: row.status, createdAt: row.created_at })),
    beds: all<{ id: string; label: string; status: string; patient_id: string | null; version: number; recorded_at: string }>(
      db,
      `SELECT id, label, status, patient_id, version, recorded_at FROM facility_beds WHERE organization_id = ? AND facility_id = ? ORDER BY id`,
      organizationId,
      facilityId,
    ).map((row) => ({ id: row.id, label: row.label, status: row.status, patientId: row.patient_id, version: row.version, recordedAt: row.recorded_at })),
    shifts: all<{ id: string; user_id: string; status: string; starts_at: string; ends_at: string; recorded_at: string }>(
      db,
      `SELECT id, user_id, status, starts_at, ends_at, recorded_at FROM facility_shifts WHERE organization_id = ? AND facility_id = ? ORDER BY id`,
      organizationId,
      facilityId,
    ).map((row) => ({ id: row.id, userId: row.user_id, status: row.status, startsAt: row.starts_at, endsAt: row.ends_at, recordedAt: row.recorded_at })),
    equipment: all<{ id: string; label: string; status: string; recorded_at: string }>(
      db,
      `SELECT id, label, status, recorded_at FROM facility_equipment WHERE organization_id = ? AND facility_id = ? ORDER BY id`,
      organizationId,
      facilityId,
    ).map((row) => ({ id: row.id, label: row.label, status: row.status, recordedAt: row.recorded_at })),
  };
}

export function facilitySourceHash(sources: SourceSnapshot) {
  return canonicalHash(sources);
}

function minutes(seconds: number) {
  return Math.round(seconds / 60);
}

function signal(
  kind: FacilitySignalKind,
  sourceTable: string,
  count: number,
  sourceAt: string | null,
  text: string,
): FacilitySignal {
  return {
    kind,
    sourceTable,
    count,
    sourceAt,
    slaSeconds: SLA_SECONDS[kind],
    slaVersion: FACILITY_SLA_VERSION,
    fresh: false,
    text,
  };
}

function withFreshness(body: FacilityBody, builtAt: string, now: Date): FacilityBody {
  return {
    signals: body.signals.map((item) => {
      const age = now.getTime() - Date.parse(builtAt);
      const fresh = item.count > 0 && age <= item.slaSeconds * 1000;
      const mark = fresh
        ? `Within the ${minutes(item.slaSeconds)} minute mark.`
        : item.count === 0
          ? "No source row is stored, so this signal is not current."
          : `Past the ${minutes(item.slaSeconds)} minute mark.`;
      return { ...item, fresh, text: `${item.text} ${mark}` };
    }),
  };
}

export function buildFacilityBody(sources: SourceSnapshot): FacilityBody {
  const openBeds = sources.beds.filter((item) => item.status === "open").length;
  const bedText =
    sources.beds.length === 0
      ? "No bed rows are stored."
      : sources.beds.map((item) => `${item.label} is ${item.status}${item.patientId ? ` · ${item.patientId}` : ""}`).join(". ") + ".";
  const shiftText = sources.shifts.length === 0 ? "No shift rows are stored." : `${sources.shifts.length} shift rows are stored.`;
  const equipmentText =
    sources.equipment.length === 0
      ? "No equipment rows are stored."
      : sources.equipment.map((item) => `${item.label} is ${item.status}`).join(". ") + ".";
  const capacityText =
    sources.beds.length === 0
      ? "No bed rows are stored. Capacity is not calculated."
      : `${openBeds} of ${sources.beds.length} stored beds are open. This is not a forecast.`;
  return {
    signals: [
      signal("appointments", "appointments", sources.appointments.length, latest(sources.appointments.map((item) => item.startsAt)), `${sources.appointments.length} booked appointments are stored.`),
      signal("queue", "encounters", sources.queue.length, latest(sources.queue.map((item) => item.startedAt)), `${sources.queue.length} encounters are in progress.`),
      signal("lab-backlog", "lab_orders", sources.labs.length, latest(sources.labs.map((item) => item.createdAt)), `${sources.labs.length} lab orders are requested or collected.`),
      signal("pharmacy", "rx_orders", sources.pharmacy.length, latest(sources.pharmacy.map((item) => item.createdAt)), `${sources.pharmacy.length} medication orders are proposed or active.`),
      signal("beds", "facility_beds", sources.beds.length, latest(sources.beds.map((item) => item.recordedAt)), bedText),
      signal("staffing", "facility_shifts", sources.shifts.length, latest(sources.shifts.map((item) => item.recordedAt)), shiftText),
      signal("equipment", "facility_equipment", sources.equipment.length, latest(sources.equipment.map((item) => item.recordedAt)), equipmentText),
      signal("capacity", "facility_beds", sources.beds.length, latest(sources.beds.map((item) => item.recordedAt)), capacityText),
    ],
  };
}

export function holdFacilitySignal(text: string, _aiOutput: unknown) {
  return text;
}

function eventForFacility(db: AppDatabase, facilityId: string, eventType: string, payload: string) {
  let body: { orderId?: string; facilityId?: string } = {};
  try {
    body = JSON.parse(payload) as { orderId?: string; facilityId?: string };
  } catch {
    return false;
  }
  if (body.facilityId) return body.facilityId === facilityId;
  if (!body.orderId) return false;
  if (eventType === "lab.order" || eventType === "lab.result") {
    const row = get<{ facility_id: string }>(db, `SELECT facility_id FROM lab_orders WHERE id = ?`, body.orderId);
    return row?.facility_id === facilityId;
  }
  if (eventType === "rx.prescribe" || eventType === "rx.activate") {
    const row = get<{ facility_id: string }>(db, `SELECT facility_id FROM rx_orders WHERE id = ?`, body.orderId);
    return row?.facility_id === facilityId;
  }
  return false;
}

function pendingEvents(db: AppDatabase, organizationId: string, facilityId: string, builtAt: string | null) {
  if (!builtAt) return false;
  const rows = all<{ event_type: string; payload_json: string }>(
    db,
    `SELECT event_type, payload_json FROM outbox WHERE organization_id = ? AND created_at > ? AND event_type IN (${SOURCE_EVENTS.map(() => "?").join(",")})`,
    organizationId,
    builtAt,
    ...SOURCE_EVENTS,
  );
  return rows.some((row) => eventForFacility(db, facilityId, row.event_type, row.payload_json));
}

type StateRow = { version: number; source_hash: string; payload_json: string; built_at: string };

function readRow(db: AppDatabase, organizationId: string, facilityId: string) {
  return get<StateRow>(
    db,
    `SELECT version, source_hash, payload_json, built_at FROM facility_state WHERE organization_id = ? AND facility_id = ?`,
    organizationId,
    facilityId,
  );
}

function toView(facilityId: string, currentHash: string, row: StateRow | undefined, eventsPending: boolean, now: Date): FacilityView {
  if (!row) {
    return {
      facilityId,
      built: false,
      version: 0,
      builtAt: null,
      sourceHash: null,
      currentSourceHash: currentHash,
      stale: true,
      eventsPending,
      state: null,
    };
  }
  const stored = JSON.parse(row.payload_json) as FacilityBody;
  return {
    facilityId,
    built: true,
    version: row.version,
    builtAt: row.built_at,
    sourceHash: row.source_hash,
    currentSourceHash: currentHash,
    stale: row.source_hash !== currentHash,
    eventsPending,
    state: withFreshness(stored, row.built_at, now),
  };
}

export function readFacility(db: AppDatabase, ctx: SessionContext, now = new Date()): FacilityView {
  const facilityId = facilityOf(ctx);
  const sources = loadSources(db, ctx.organizationId, facilityId);
  const currentHash = facilitySourceHash(sources);
  const row = readRow(db, ctx.organizationId, facilityId);
  const view = toView(facilityId, currentHash, row, pendingEvents(db, ctx.organizationId, facilityId, row?.built_at ?? null), now);
  writeAudit(db, ctx, { action: "facility.read", resourceType: "FacilityState", resourceId: facilityId, outcome: "success" });
  return view;
}

export function rebuildFacility(db: AppDatabase, ctx: SessionContext, idempotencyKey: string, now = new Date()) {
  const facilityId = facilityOf(ctx);
  assertKey(idempotencyKey);
  const sources = loadSources(db, ctx.organizationId, facilityId);
  const sourceHash = facilitySourceHash(sources);
  const requestHash = canonicalHash({ facilityId, sourceHash });
  return transaction(db, () => {
    const existing = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      idempotencyKey,
    );
    if (existing) {
      if (existing.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(existing.response_json) as FacilityView;
    }
    const current = readRow(db, ctx.organizationId, facilityId);
    const builtAt = now.toISOString();
    let stored = current;
    if (!current || current.source_hash !== sourceHash) {
      const version = (current?.version ?? 0) + 1;
      const payload = buildFacilityBody(sources);
      if (current) {
        execute(
          db,
          `UPDATE facility_state SET version = ?, source_hash = ?, payload_json = ?, built_at = ? WHERE organization_id = ? AND facility_id = ?`,
          version,
          sourceHash,
          JSON.stringify(payload),
          builtAt,
          ctx.organizationId,
          facilityId,
        );
      } else {
        execute(
          db,
          `INSERT INTO facility_state (organization_id, facility_id, version, source_hash, payload_json, built_at) VALUES (?, ?, ?, ?, ?, ?)`,
          ctx.organizationId,
          facilityId,
          version,
          sourceHash,
          JSON.stringify(payload),
          builtAt,
        );
      }
      execute(
        db,
        `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'facility.rebuild', ?, ?)`,
        randomUUID(),
        ctx.organizationId,
        JSON.stringify({ facilityId, version, sourceHash }),
        builtAt,
      );
      stored = { version, source_hash: sourceHash, payload_json: JSON.stringify(payload), built_at: builtAt };
    }
    const result = toView(facilityId, sourceHash, stored, false, now);
    writeAudit(db, ctx, { action: "facility.rebuild", resourceType: "FacilityState", resourceId: facilityId, outcome: "success" });
    execute(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      idempotencyKey,
      ctx.userId,
      requestHash,
      JSON.stringify(result),
      builtAt,
    );
    return result;
  });
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

export function recordBed(
  db: AppDatabase,
  ctx: SessionContext,
  input: { label: string; status: string; patientId?: string; idempotencyKey: string },
) {
  const facilityId = facilityOf(ctx);
  assertKey(input.idempotencyKey);
  const label = clean(input.label, 2, 80);
  if (input.status !== "open" && input.status !== "occupied" && input.status !== "closed") throw new ValidationError("code");
  const patientId = input.patientId?.trim() || null;
  if (input.status === "occupied" && !patientId) throw new ValidationError();
  if (input.status !== "occupied" && patientId) throw new ValidationError();
  if (patientId) {
    const patient = get<{ id: string }>(
      db,
      `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
      patientId,
      ctx.organizationId,
      facilityId,
    );
    if (!patient) throw new NotFoundError();
  }
  const hash = canonicalHash({ facilityId, label, status: input.status, patientId });
  const existing = replay<{ bedId: string; version: number }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const bedId = `bed_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { bedId, version: 1 };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO facility_beds (id, organization_id, facility_id, label, status, patient_id, version, author_id, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`,
      bedId,
      ctx.organizationId,
      facilityId,
      label,
      input.status,
      patientId,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "facility.bed", { bedId, facilityId }, now);
    writeAudit(db, ctx, { action: "facility.bed", resourceType: "FacilityBed", resourceId: bedId, outcome: "success" });
  });
  return saved;
}

export function setBedStatus(
  db: AppDatabase,
  ctx: SessionContext,
  input: { bedId: string; status: string; patientId?: string; expectedVersion: number; idempotencyKey: string },
) {
  const facilityId = facilityOf(ctx);
  assertKey(input.idempotencyKey);
  if (!Number.isInteger(input.expectedVersion) || input.expectedVersion < 1) throw new ValidationError();
  if (input.status !== "open" && input.status !== "occupied" && input.status !== "closed") throw new ValidationError("code");
  const patientId = input.patientId?.trim() || null;
  if (input.status === "occupied" && !patientId) throw new ValidationError();
  if (input.status !== "occupied" && patientId) throw new ValidationError();
  if (patientId) {
    const patient = get<{ id: string }>(
      db,
      `SELECT id FROM patients WHERE id = ? AND organization_id = ? AND facility_id = ?`,
      patientId,
      ctx.organizationId,
      facilityId,
    );
    if (!patient) throw new NotFoundError();
  }
  const hash = canonicalHash({ bedId: input.bedId, status: input.status, patientId, expectedVersion: input.expectedVersion });
  const existing = replay<{ bedId: string; version: number }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const bed = get<{ id: string; version: number }>(
    db,
    `SELECT id, version FROM facility_beds WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    input.bedId,
    ctx.organizationId,
    facilityId,
  );
  if (!bed) throw new NotFoundError();
  if (bed.version !== input.expectedVersion) throw new ConflictError("conflict", "The bed changed. Reload and try again.");
  const now = new Date().toISOString();
  const saved = { bedId: bed.id, version: bed.version + 1 };
  transaction(db, () => {
    const changed = execute(
      db,
      `UPDATE facility_beds SET status = ?, patient_id = ?, version = version + 1, author_id = ?, recorded_at = ? WHERE id = ? AND version = ?`,
      input.status,
      patientId,
      ctx.userId,
      now,
      bed.id,
      bed.version,
    );
    if (Number(changed.changes) !== 1) throw new ConflictError("conflict", "The bed changed. Reload and try again.");
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "facility.bed", { bedId: bed.id, facilityId }, now);
    writeAudit(db, ctx, { action: "facility.bed", resourceType: "FacilityBed", resourceId: bed.id, outcome: "success" });
  });
  return saved;
}

export function recordShift(
  db: AppDatabase,
  ctx: SessionContext,
  input: { userId: string; startsAt: string; endsAt: string; status: string; idempotencyKey: string },
) {
  const facilityId = facilityOf(ctx);
  assertKey(input.idempotencyKey);
  if (input.status !== "scheduled" && input.status !== "active" && input.status !== "finished") throw new ValidationError("code");
  const startsAt = instant(input.startsAt);
  const endsAt = instant(input.endsAt);
  if (Date.parse(endsAt) <= Date.parse(startsAt)) throw new ValidationError();
  const user = get<{ id: string }>(
    db,
    `SELECT id FROM users WHERE id = ? AND organization_id = ? AND facility_id = ? AND role IN ('clinician','nurse')`,
    input.userId,
    ctx.organizationId,
    facilityId,
  );
  if (!user) throw new NotFoundError();
  const hash = canonicalHash({ facilityId, userId: input.userId, startsAt, endsAt, status: input.status });
  const existing = replay<{ shiftId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const shiftId = `shf_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { shiftId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO facility_shifts (id, organization_id, facility_id, user_id, starts_at, ends_at, status, author_id, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      shiftId,
      ctx.organizationId,
      facilityId,
      input.userId,
      startsAt,
      endsAt,
      input.status,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "facility.shift", { shiftId, facilityId }, now);
    writeAudit(db, ctx, { action: "facility.shift", resourceType: "FacilityShift", resourceId: shiftId, outcome: "success" });
  });
  return saved;
}

export function recordEquipment(db: AppDatabase, ctx: SessionContext, input: { label: string; status: string; idempotencyKey: string }) {
  const facilityId = facilityOf(ctx);
  assertKey(input.idempotencyKey);
  const label = clean(input.label, 2, 80);
  if (input.status !== "available" && input.status !== "out-of-service") throw new ValidationError("code");
  const hash = canonicalHash({ facilityId, label, status: input.status });
  const existing = replay<{ equipmentId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const equipmentId = `eq_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { equipmentId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO facility_equipment (id, organization_id, facility_id, label, status, author_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      equipmentId,
      ctx.organizationId,
      facilityId,
      label,
      input.status,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "facility.equipment", { equipmentId, facilityId }, now);
    writeAudit(db, ctx, { action: "facility.equipment", resourceType: "FacilityEquipment", resourceId: equipmentId, outcome: "success" });
  });
  return saved;
}

export function explainFacility(db: AppDatabase, ctx: SessionContext, input: { idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  const view = readFacility(db, ctx);
  const gateway = invokeGateway(
    db,
    ctx,
    {
      promptId: GATEWAY_PROMPT.id,
      promptVersion: GATEWAY_PROMPT.version,
      text: "Explain the listed facility identifiers.",
      idempotencyKey: input.idempotencyKey,
    },
    adapter,
  );
  return {
    signals: (view.state?.signals ?? []).map((item) => ({ ...item, text: holdFacilitySignal(item.text, gateway.output) })),
    aiOutcome: gateway.outcome,
    aiText: null,
  };
}

export type FacilityBedRow = {
  id: string;
  label: string;
  ward: string;
  status: "open" | "occupied" | "closed";
  patientId: string | null;
  patientName: string | null;
  mrn: string | null;
};

export type FacilityShiftRow = {
  id: string;
  displayName: string;
  status: string;
  startsAt: string;
  endsAt: string;
};

function daySpan(start: string, end: string) {
  const ms = Date.parse(end) - Date.parse(start);
  if (!Number.isFinite(ms) || ms < 0) return null;
  return Math.round((ms / 86_400_000) * 10) / 10;
}

export type FacilityActivity = {
  stayDays: Record<string, number>;
  averageStayDays: number | null;
  finishedEncounters: number;
  labs: { requested: number; collected: number; resulted: number; cancelled: number };
};

export function readFacilityActivity(db: AppDatabase, ctx: SessionContext, now = new Date()): FacilityActivity {
  if (!canReadChart(ctx) || !ctx.facilityId) throw new ForbiddenError();
  const encounters = all<{ patient_id: string; status: string; started_at: string; ended_at: string | null }>(
    db,
    `SELECT patient_id, status, started_at, ended_at FROM encounters
     WHERE organization_id = ? AND facility_id = ?
     ORDER BY started_at DESC`,
    ctx.organizationId,
    ctx.facilityId,
  );
  const stayDays: Record<string, number> = {};
  const finished: number[] = [];
  for (const row of encounters) {
    if (!(row.patient_id in stayDays)) {
      const end = row.ended_at ?? (row.status === "in-progress" ? now.toISOString() : null);
      const days = end ? daySpan(row.started_at, end) : null;
      if (days !== null) stayDays[row.patient_id] = days;
    }
    if (row.status === "finished" && row.ended_at) {
      const span = daySpan(row.started_at, row.ended_at);
      if (span !== null) finished.push(span);
    }
  }
  const labs = all<{ status: string; c: number }>(
    db,
    `SELECT status, COUNT(*) AS c FROM lab_orders WHERE organization_id = ? AND facility_id = ? GROUP BY status`,
    ctx.organizationId,
    ctx.facilityId,
  );
  const count = (status: string) => Number(labs.find((row) => row.status === status)?.c ?? 0);
  const averageStayDays = finished.length === 0 ? null : Math.round((finished.reduce((sum, days) => sum + days, 0) / finished.length) * 10) / 10;
  return {
    stayDays,
    averageStayDays,
    finishedEncounters: finished.length,
    labs: { requested: count("requested"), collected: count("collected"), resulted: count("resulted"), cancelled: count("cancelled") },
  };
}

export function listFacilityBoard(db: AppDatabase, ctx: SessionContext): { beds: FacilityBedRow[]; shifts: FacilityShiftRow[] } {
  if (!canReadChart(ctx) || !ctx.facilityId) throw new ForbiddenError();
  const rows = all<{
    id: string;
    label: string;
    status: "open" | "occupied" | "closed";
    patient_id: string | null;
    given_name: string | null;
    family_name: string | null;
    mrn: string | null;
  }>(
    db,
    `SELECT b.id, b.label, b.status, b.patient_id, p.given_name, p.family_name, p.mrn
     FROM facility_beds b
     LEFT JOIN patients p ON p.id = b.patient_id
     WHERE b.organization_id = ? AND b.facility_id = ?
     ORDER BY b.label`,
    ctx.organizationId,
    ctx.facilityId,
  );
  const shifts = all<{ id: string; display_name: string; status: string; starts_at: string; ends_at: string }>(
    db,
    `SELECT s.id, u.display_name, s.status, s.starts_at, s.ends_at
     FROM facility_shifts s
     JOIN users u ON u.id = s.user_id
     WHERE s.organization_id = ? AND s.facility_id = ?
     ORDER BY s.starts_at, u.display_name`,
    ctx.organizationId,
    ctx.facilityId,
  );
  return {
    beds: rows.map((row) => ({
      id: row.id,
      label: row.label,
      ward: row.label.includes("-") ? (row.label.split("-")[0] ?? "Clinic") : "Clinic",
      status: row.status,
      patientId: row.patient_id,
      patientName: row.given_name && row.family_name ? `${row.given_name} ${row.family_name}` : null,
      mrn: row.mrn,
    })),
    shifts: shifts.map((row) => ({
      id: row.id,
      displayName: row.display_name,
      status: row.status,
      startsAt: row.starts_at,
      endsAt: row.ends_at,
    })),
  };
}

const CLINIC_BEDS: Array<[string, string, string, string, string, string | null, string]> = [
  ["bed_icu_310", "org_harborlight", "fac_riverside", "ICU-310", "occupied", "pat_elena", "usr_amira"],
  ["bed_icu_311", "org_harborlight", "fac_riverside", "ICU-311", "occupied", "pat_walter", "usr_amira"],
  ["bed_gen_221", "org_harborlight", "fac_riverside", "GEN-221", "occupied", "pat_helen", "usr_amira"],
  ["bed_gen_222", "org_harborlight", "fac_riverside", "GEN-222", "occupied", "pat_jonah", "usr_amira"],
  ["bed_gen_223", "org_harborlight", "fac_riverside", "GEN-223", "occupied", "pat_owen", "usr_amira"],
  ["bed_gen_224", "org_harborlight", "fac_riverside", "GEN-224", "occupied", "pat_mateo", "usr_amira"],
  ["bed_gen_225", "org_harborlight", "fac_riverside", "GEN-225", "occupied", "pat_camille", "usr_amira"],
  ["bed_gen_226", "org_harborlight", "fac_riverside", "GEN-226", "open", null, "usr_amira"],
  ["bed_gen_227", "org_harborlight", "fac_riverside", "GEN-227", "open", null, "usr_amira"],
  ["bed_iso_101", "org_harborlight", "fac_riverside", "ISO-101", "closed", null, "usr_amira"],
  ["bed_eas_201", "org_harborlight", "fac_east", "GEN-201", "occupied", "pat_farah", "usr_lea"],
  ["bed_eas_202", "org_harborlight", "fac_east", "GEN-202", "occupied", "pat_luis", "usr_lea"],
  ["bed_eas_203", "org_harborlight", "fac_east", "GEN-203", "occupied", "pat_noor", "usr_lea"],
  ["bed_lak_401", "org_northwind", "fac_lakeside", "GEN-401", "occupied", "pat_grace", "usr_evan"],
  ["bed_lak_402", "org_northwind", "fac_lakeside", "GEN-402", "occupied", "pat_samir", "usr_evan"],
  ["bed_lak_403", "org_northwind", "fac_lakeside", "GEN-403", "occupied", "pat_ben", "usr_evan"],
];

export function ensureClinicBoard(db: AppDatabase) {
  for (const [id, orgId, facilityId, label, status, patientId, authorId] of CLINIC_BEDS) {
    execute(
      db,
      `INSERT INTO facility_beds (id, organization_id, facility_id, label, status, patient_id, version, author_id, recorded_at)
       SELECT ?, ?, ?, ?, ?, ?, 1, ?, '2026-10-08T08:00:00.000Z'
       WHERE NOT EXISTS (SELECT 1 FROM facility_beds WHERE id = ?)
         AND (? IS NULL OR EXISTS (SELECT 1 FROM patients WHERE id = ?))
         AND EXISTS (SELECT 1 FROM facilities WHERE id = ?)`,
      id,
      orgId,
      facilityId,
      label,
      status,
      patientId,
      authorId,
      id,
      patientId,
      patientId,
      facilityId,
    );
  }
  const shifts = [
    ["sh_amira", "org_harborlight", "fac_riverside", "usr_amira"],
    ["sh_jordan", "org_harborlight", "fac_riverside", "usr_jordan"],
    ["sh_lea", "org_harborlight", "fac_east", "usr_lea"],
    ["sh_evan", "org_northwind", "fac_lakeside", "usr_evan"],
  ] as const;
  for (const [id, orgId, facilityId, userId] of shifts) {
    execute(
      db,
      `INSERT INTO facility_shifts (id, organization_id, facility_id, user_id, starts_at, ends_at, status, author_id, recorded_at)
       SELECT ?, ?, ?, ?, '2026-10-08T07:00:00.000Z', '2026-10-08T19:00:00.000Z', 'active', ?, '2026-10-08T07:00:00.000Z'
       WHERE NOT EXISTS (SELECT 1 FROM facility_shifts WHERE id = ?)
         AND EXISTS (SELECT 1 FROM users WHERE id = ?)`,
      id,
      orgId,
      facilityId,
      userId,
      userId,
      id,
      userId,
    );
  }
  const equipment = [
    ["eq_icu_monitor", "org_harborlight", "fac_riverside", "ICU monitor", "available", "usr_amira"],
    ["eq_gen_pump", "org_harborlight", "fac_riverside", "General infusion pump", "available", "usr_amira"],
    ["eq_iso_vent", "org_harborlight", "fac_riverside", "Isolation ventilator", "out-of-service", "usr_amira"],
  ] as const;
  for (const [id, orgId, facilityId, label, status, authorId] of equipment) {
    execute(
      db,
      `INSERT INTO facility_equipment (id, organization_id, facility_id, label, status, author_id, recorded_at)
       SELECT ?, ?, ?, ?, ?, ?, '2026-10-08T08:00:00.000Z'
       WHERE NOT EXISTS (SELECT 1 FROM facility_equipment WHERE id = ?)
         AND EXISTS (SELECT 1 FROM facilities WHERE id = ?)`,
      id,
      orgId,
      facilityId,
      label,
      status,
      authorId,
      id,
      facilityId,
    );
  }
  const labs = [
    ["lab_sim_bnp", "org_harborlight", "fac_riverside", "pat_walter", "30934-4", "B-type natriuretic peptide", "requested", "usr_amira"],
    ["lab_sim_k", "org_harborlight", "fac_riverside", "pat_elena", "2823-3", "Potassium", "collected", "usr_amira"],
  ] as const;
  for (const [id, orgId, facilityId, patientId, code, display, status, authorId] of labs) {
    execute(
      db,
      `INSERT INTO lab_orders (id, organization_id, facility_id, patient_id, code, display, status, author_id, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, ?, '2026-10-08T09:00:00.000Z'
       WHERE NOT EXISTS (SELECT 1 FROM lab_orders WHERE id = ?)
         AND EXISTS (SELECT 1 FROM patients WHERE id = ?)`,
      id,
      orgId,
      facilityId,
      patientId,
      code,
      display,
      status,
      authorId,
      id,
      patientId,
    );
  }
  const orders = [
    ["rx_sim_furosemide", "org_harborlight", "fac_riverside", "pat_walter", "frm_furosemide", "20 mg daily", "active", "usr_amira"],
    ["rx_sim_metformin", "org_harborlight", "fac_riverside", "pat_elena", "frm_metformin", "500 mg twice daily", "proposed", "usr_amira"],
  ] as const;
  for (const [id, orgId, facilityId, patientId, formularyId, dose, status, authorId] of orders) {
    execute(
      db,
      `INSERT INTO rx_orders (id, organization_id, facility_id, patient_id, formulary_id, dose, status, medication_id, author_id, created_at)
       SELECT ?, ?, ?, ?, ?, ?, ?, NULL, ?, '2026-10-08T09:10:00.000Z'
       WHERE NOT EXISTS (SELECT 1 FROM rx_orders WHERE id = ?)
         AND EXISTS (SELECT 1 FROM patients WHERE id = ?)
         AND EXISTS (SELECT 1 FROM rx_formulary WHERE id = ?)`,
      id,
      orgId,
      facilityId,
      patientId,
      formularyId,
      dose,
      status,
      authorId,
      id,
      patientId,
      formularyId,
    );
  }
}

export function seedFacilityRecords(db: AppDatabase) {
  const existing = get<{ c: number }>(db, "SELECT COUNT(*) AS c FROM facility_beds");
  if ((existing?.c ?? 0) > 0) return;
  const beds = [
    ["bed_riverside_1", "Bay 1", "open"],
    ["bed_riverside_2", "Bay 2", "closed"],
  ] as const;
  for (const [id, label, status] of beds) {
    execute(
      db,
      `INSERT INTO facility_beds (id, organization_id, facility_id, label, status, patient_id, version, author_id, recorded_at)
       VALUES (?, 'org_harborlight', 'fac_riverside', ?, ?, NULL, 1, 'usr_amira', '2026-10-08T08:00:00.000Z')`,
      id,
      label,
      status,
    );
  }
  execute(
    db,
    `INSERT INTO facility_equipment (id, organization_id, facility_id, label, status, author_id, recorded_at)
     VALUES ('eq_riverside_monitor', 'org_harborlight', 'fac_riverside', 'Spot monitor', 'available', 'usr_amira', '2026-10-08T08:00:00.000Z')`,
  );
}
