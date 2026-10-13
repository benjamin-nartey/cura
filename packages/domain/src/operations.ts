import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";
import { canReadChart } from "./session";

export const OPS_KPI_VERSION = "ops-kpi-2026.10";
export const OPS_CONFIDENCE_VERSION = "ops-confidence-2026.10";

const KINDS = ["wait", "capacity", "inventory", "staffing", "bottleneck"] as const;
const SOURCE_EVENTS = [
  "lab.order",
  "lab.result",
  "rx.prescribe",
  "rx.activate",
  "facility.bed",
  "facility.shift",
  "facility.equipment",
  "operations.inventory",
  "operations.override",
] as const;

export type OpsKind = (typeof KINDS)[number];
export type OpsConfidence = "none" | "low" | "stored";

export type OpsFactor = {
  name: string;
  value: string;
  sourceTable: string;
};

export type OpsHold = {
  id: string;
  kind: OpsKind;
  action: "hold";
  reason: string;
  createdAt: string;
};

export type OpsRecommendation = {
  kind: OpsKind;
  factors: OpsFactor[];
  confidence: OpsConfidence;
  confidenceVersion: string;
  text: string;
  override: OpsHold | null;
};

export type OpsKpi = {
  bookedAppointments: number;
  inProgressEncounters: number;
  oldestWaitMinutes: number | null;
  openBeds: number;
  storedBeds: number;
  labBacklog: number;
  pharmacyBacklog: number;
  rosteredShifts: number;
  inventoryOnHand: number;
};

export type OpsDelta = {
  [Key in keyof OpsKpi]: OpsKpi[Key] extends number ? number : number | null;
};

export type OpsBody = {
  recommendations: OpsRecommendation[];
  kpi: {
    version: string;
    baseline: OpsKpi;
    current: OpsKpi;
    delta: OpsDelta;
    text: string;
  };
};

export type OpsView = {
  facilityId: string;
  built: boolean;
  version: number;
  builtAt: string | null;
  sourceHash: string | null;
  currentSourceHash: string;
  stale: boolean;
  eventsPending: boolean;
  holds: OpsHold[];
  state: OpsBody | null;
};

type InventoryRow = { id: string; label: string; onHand: number; recordedAt: string };
type ShiftRow = { id: string; status: string; recordedAt: string };
type EncounterRow = { id: string; startedAt: string };

type Snapshot = {
  appointments: { id: string }[];
  queue: EncounterRow[];
  labs: { id: string }[];
  pharmacy: { id: string }[];
  beds: { id: string; status: string }[];
  shifts: ShiftRow[];
  equipment: { id: string }[];
  inventory: InventoryRow[];
  overrides: OpsHold[];
};

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function clean(value: string, min: number, max: number) {
  const trimmed = value.trim();
  if (trimmed.length < min || trimmed.length > max) throw new ValidationError();
  return trimmed;
}

function facilityOf(ctx: SessionContext) {
  if (!ctx.facilityId || !canReadChart(ctx) || ctx.role === "patient") throw new ForbiddenError();
  return ctx.facilityId;
}

function isKind(value: string): value is OpsKind {
  return (KINDS as readonly string[]).includes(value);
}

function confidence(count: number): OpsConfidence {
  if (count <= 0) return "none";
  if (count < 3) return "low";
  return "stored";
}

function recommendation(kind: OpsKind, factors: OpsFactor[], count: number, text: string): OpsRecommendation {
  return {
    kind,
    factors,
    confidence: confidence(count),
    confidenceVersion: OPS_CONFIDENCE_VERSION,
    text,
    override: null,
  };
}

function waitMinutes(startedAt: string, now: Date) {
  const age = now.getTime() - Date.parse(startedAt);
  if (!Number.isFinite(age) || age < 0) return 0;
  return Math.floor(age / 60000);
}

function measure(sources: Snapshot, now: Date): OpsKpi {
  const oldest = sources.queue.slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
  return {
    bookedAppointments: sources.appointments.length,
    inProgressEncounters: sources.queue.length,
    oldestWaitMinutes: oldest ? waitMinutes(oldest.startedAt, now) : null,
    openBeds: sources.beds.filter((item) => item.status === "open").length,
    storedBeds: sources.beds.length,
    labBacklog: sources.labs.length,
    pharmacyBacklog: sources.pharmacy.length,
    rosteredShifts: sources.shifts.filter((item) => item.status === "scheduled" || item.status === "active").length,
    inventoryOnHand: sources.inventory.reduce((sum, item) => sum + item.onHand, 0),
  };
}

function subtract(baseline: OpsKpi, current: OpsKpi): OpsDelta {
  return {
    bookedAppointments: current.bookedAppointments - baseline.bookedAppointments,
    inProgressEncounters: current.inProgressEncounters - baseline.inProgressEncounters,
    oldestWaitMinutes:
      baseline.oldestWaitMinutes === null || current.oldestWaitMinutes === null
        ? null
        : current.oldestWaitMinutes - baseline.oldestWaitMinutes,
    openBeds: current.openBeds - baseline.openBeds,
    storedBeds: current.storedBeds - baseline.storedBeds,
    labBacklog: current.labBacklog - baseline.labBacklog,
    pharmacyBacklog: current.pharmacyBacklog - baseline.pharmacyBacklog,
    rosteredShifts: current.rosteredShifts - baseline.rosteredShifts,
    inventoryOnHand: current.inventoryOnHand - baseline.inventoryOnHand,
  };
}

function countsMatch(baseline: OpsKpi, current: OpsKpi) {
  const delta = subtract(baseline, current);
  return (
    delta.bookedAppointments === 0 &&
    delta.inProgressEncounters === 0 &&
    delta.openBeds === 0 &&
    delta.storedBeds === 0 &&
    delta.labBacklog === 0 &&
    delta.pharmacyBacklog === 0 &&
    delta.rosteredShifts === 0 &&
    delta.inventoryOnHand === 0
  );
}

function impactText(baseline: OpsKpi, current: OpsKpi) {
  if (countsMatch(baseline, current)) {
    return "The baseline counts match this build. Wait age is remeasured at the build. This is not a revenue or clinical outcome.";
  }
  const delta = subtract(baseline, current);
  return `Since the baseline build, stored rows changed by in-progress encounters ${delta.inProgressEncounters}, lab backlog ${delta.labBacklog}, pharmacy backlog ${delta.pharmacyBacklog}, open beds ${delta.openBeds}, and on-hand inventory ${delta.inventoryOnHand}. This is not a revenue or clinical outcome.`;
}

export function buildOperationsBody(sources: Snapshot, now: Date, baseline: OpsKpi | null): OpsBody {
  const current = measure(sources, now);
  const frozen = baseline ?? current;
  const oldest = sources.queue.slice().sort((a, b) => a.startedAt.localeCompare(b.startedAt))[0];
  const waitText =
    sources.queue.length === 0
      ? "No in-progress encounter is stored. Wait time is not calculated."
      : `The oldest stored in-progress encounter was ${current.oldestWaitMinutes} minutes old at this build. This is the age of a stored row. It is not a predicted wait.`;
  const capacityText =
    sources.beds.length === 0
      ? "No bed rows are stored. Capacity is not forecast."
      : `${current.openBeds} of ${current.storedBeds} stored beds are open. This count is not a forecast of later occupancy.`;
  const inventoryText =
    sources.inventory.length === 0
      ? "No inventory rows are stored. Inventory is not forecast."
      : `${sources.inventory.map((item) => `${item.label} on-hand ${item.onHand}`).join(". ")}. No issue history is stored, so later use is not forecast.`;
  const staffingText =
    sources.shifts.length === 0
      ? "No shift rows are stored. No staffing change is recommended."
      : current.rosteredShifts < current.inProgressEncounters
        ? "Stored rostered shifts are fewer than in-progress encounters. This comparison is not an order to add staff."
        : "Stored rostered shifts are at least the number of in-progress encounters. No staffing change is recommended from these rows.";
  const backlog = [
    { label: "in-progress encounters", count: sources.queue.length },
    { label: "lab orders", count: sources.labs.length },
    { label: "medication orders", count: sources.pharmacy.length },
  ];
  const largest = backlog.reduce((best, item) => (item.count > best.count ? item : best));
  const bottleneckText =
    largest.count === 0
      ? "No backlog row is stored. No bottleneck is named."
      : `The largest stored backlog is ${largest.label} with ${largest.count} rows. This comparison is not a detected flow constraint.`;
  return {
    recommendations: [
      recommendation(
        "wait",
        [
          { name: "in-progress encounters", value: String(sources.queue.length), sourceTable: "encounters" },
          { name: "oldest start", value: oldest?.startedAt ?? "none", sourceTable: "encounters" },
          { name: "age at build in minutes", value: current.oldestWaitMinutes === null ? "none" : String(current.oldestWaitMinutes), sourceTable: "encounters" },
        ],
        sources.queue.length,
        waitText,
      ),
      recommendation(
        "capacity",
        [
          { name: "open beds", value: String(current.openBeds), sourceTable: "facility_beds" },
          { name: "stored beds", value: String(current.storedBeds), sourceTable: "facility_beds" },
        ],
        sources.beds.length,
        capacityText,
      ),
      recommendation(
        "inventory",
        [
          { name: "inventory rows", value: String(sources.inventory.length), sourceTable: "operations_inventory" },
          { name: "on-hand total", value: String(current.inventoryOnHand), sourceTable: "operations_inventory" },
        ],
        sources.inventory.length,
        inventoryText,
      ),
      recommendation(
        "staffing",
        [
          { name: "rostered shifts", value: String(current.rosteredShifts), sourceTable: "facility_shifts" },
          { name: "in-progress encounters", value: String(current.inProgressEncounters), sourceTable: "encounters" },
        ],
        sources.shifts.length,
        staffingText,
      ),
      recommendation(
        "bottleneck",
        [
          { name: "in-progress encounters", value: String(sources.queue.length), sourceTable: "encounters" },
          { name: "lab orders", value: String(sources.labs.length), sourceTable: "lab_orders" },
          { name: "medication orders", value: String(sources.pharmacy.length), sourceTable: "rx_orders" },
        ],
        largest.count,
        bottleneckText,
      ),
    ],
    kpi: {
      version: OPS_KPI_VERSION,
      baseline: frozen,
      current,
      delta: subtract(frozen, current),
      text: impactText(frozen, current),
    },
  };
}

export function holdOperationsText(text: string, _aiOutput: unknown) {
  return text;
}

function loadSnapshot(db: AppDatabase, organizationId: string, facilityId: string): Snapshot {
  return {
    appointments: all<{ id: string }>(
      db,
      `SELECT id FROM appointments WHERE organization_id = ? AND facility_id = ? AND status = 'booked' ORDER BY id`,
      organizationId,
      facilityId,
    ),
    queue: all<{ id: string; started_at: string }>(
      db,
      `SELECT id, started_at FROM encounters WHERE organization_id = ? AND facility_id = ? AND status = 'in-progress' ORDER BY id`,
      organizationId,
      facilityId,
    ).map((row) => ({ id: row.id, startedAt: row.started_at })),
    labs: all<{ id: string }>(
      db,
      `SELECT id FROM lab_orders WHERE organization_id = ? AND facility_id = ? AND status IN ('requested','collected') ORDER BY id`,
      organizationId,
      facilityId,
    ),
    pharmacy: all<{ id: string }>(
      db,
      `SELECT id FROM rx_orders WHERE organization_id = ? AND facility_id = ? AND status IN ('proposed','active') ORDER BY id`,
      organizationId,
      facilityId,
    ),
    beds: all<{ id: string; status: string }>(
      db,
      `SELECT id, status FROM facility_beds WHERE organization_id = ? AND facility_id = ? ORDER BY id`,
      organizationId,
      facilityId,
    ),
    shifts: all<{ id: string; status: string; recorded_at: string }>(
      db,
      `SELECT id, status, recorded_at FROM facility_shifts WHERE organization_id = ? AND facility_id = ? ORDER BY id`,
      organizationId,
      facilityId,
    ).map((row) => ({ id: row.id, status: row.status, recordedAt: row.recorded_at })),
    equipment: all<{ id: string }>(
      db,
      `SELECT id FROM facility_equipment WHERE organization_id = ? AND facility_id = ? ORDER BY id`,
      organizationId,
      facilityId,
    ),
    inventory: all<{ id: string; label: string; on_hand: number; recorded_at: string }>(
      db,
      `SELECT id, label, on_hand, recorded_at FROM operations_inventory WHERE organization_id = ? AND facility_id = ? ORDER BY id`,
      organizationId,
      facilityId,
    ).map((row) => ({ id: row.id, label: row.label, onHand: row.on_hand, recordedAt: row.recorded_at })),
    overrides: loadHolds(db, organizationId, facilityId),
  };
}

function loadHolds(db: AppDatabase, organizationId: string, facilityId: string): OpsHold[] {
  const rows = all<{ id: string; kind: string; action: string; reason: string; created_at: string }>(
    db,
    `SELECT id, kind, action, reason, created_at FROM operations_overrides WHERE organization_id = ? AND facility_id = ? ORDER BY created_at, id`,
    organizationId,
    facilityId,
  );
  const latest = new Map<OpsKind, OpsHold>();
  for (const row of rows) {
    if (!isKind(row.kind) || row.action !== "hold") continue;
    latest.set(row.kind, { id: row.id, kind: row.kind, action: "hold", reason: row.reason, createdAt: row.created_at });
  }
  return KINDS.flatMap((kind) => {
    const hold = latest.get(kind);
    return hold ? [hold] : [];
  });
}

function rowHash(sources: Snapshot) {
  return canonicalHash(sources);
}

function applyHolds(body: OpsBody, holds: OpsHold[]): OpsBody {
  const byKind = new Map(holds.map((hold) => [hold.kind, hold]));
  return {
    ...body,
    recommendations: body.recommendations.map((item) => ({ ...item, override: byKind.get(item.kind) ?? null })),
  };
}

type StateRow = { version: number; source_hash: string; payload_json: string; baseline_json: string; built_at: string };

function readRow(db: AppDatabase, organizationId: string, facilityId: string) {
  return get<StateRow>(
    db,
    `SELECT version, source_hash, payload_json, baseline_json, built_at FROM operations_state WHERE organization_id = ? AND facility_id = ?`,
    organizationId,
    facilityId,
  );
}

function eventForFacility(db: AppDatabase, facilityId: string, payload: string) {
  let body: { orderId?: string; facilityId?: string } = {};
  try {
    body = JSON.parse(payload) as { orderId?: string; facilityId?: string };
  } catch {
    return false;
  }
  if (body.facilityId) return body.facilityId === facilityId;
  if (!body.orderId) return false;
  const lab = get<{ facility_id: string }>(db, `SELECT facility_id FROM lab_orders WHERE id = ?`, body.orderId);
  if (lab) return lab.facility_id === facilityId;
  const rx = get<{ facility_id: string }>(db, `SELECT facility_id FROM rx_orders WHERE id = ?`, body.orderId);
  return rx?.facility_id === facilityId;
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
  return rows.some((row) => eventForFacility(db, facilityId, row.payload_json));
}

function toView(facilityId: string, currentHash: string, row: StateRow | undefined, holds: OpsHold[], eventsPending: boolean): OpsView {
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
      holds,
      state: null,
    };
  }
  const stored = JSON.parse(row.payload_json) as OpsBody;
  return {
    facilityId,
    built: true,
    version: row.version,
    builtAt: row.built_at,
    sourceHash: row.source_hash,
    currentSourceHash: currentHash,
    stale: row.source_hash !== currentHash,
    eventsPending,
    holds,
    state: applyHolds(stored, holds),
  };
}

export function readOperations(db: AppDatabase, ctx: SessionContext, _now = new Date()): OpsView {
  const facilityId = facilityOf(ctx);
  const sources = loadSnapshot(db, ctx.organizationId, facilityId);
  const currentHash = rowHash(sources);
  const row = readRow(db, ctx.organizationId, facilityId);
  const view = toView(facilityId, currentHash, row, sources.overrides, pendingEvents(db, ctx.organizationId, facilityId, row?.built_at ?? null));
  writeAudit(db, ctx, { action: "operations.read", resourceType: "OperationsState", resourceId: facilityId, outcome: "success" });
  return view;
}

export function rebuildOperations(db: AppDatabase, ctx: SessionContext, idempotencyKey: string, now = new Date()) {
  const facilityId = facilityOf(ctx);
  assertKey(idempotencyKey);
  const sources = loadSnapshot(db, ctx.organizationId, facilityId);
  const hash = rowHash(sources);
  const measuredMinutes = measure(sources, now).oldestWaitMinutes;
  const requestHash = canonicalHash({ facilityId, sourceHash: hash, oldestWaitMinutes: measuredMinutes });
  return transaction(db, () => {
    const existing = get<{ request_hash: string; response_json: string }>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      idempotencyKey,
    );
    if (existing) {
      if (existing.request_hash !== requestHash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      return JSON.parse(existing.response_json) as OpsView;
    }
    const current = readRow(db, ctx.organizationId, facilityId);
    const builtAt = now.toISOString();
    const storedMinutes = current ? (JSON.parse(current.payload_json) as OpsBody).kpi.current.oldestWaitMinutes : undefined;
    let stored = current;
    if (!current || current.source_hash !== hash || storedMinutes !== measuredMinutes) {
      const version = (current?.version ?? 0) + 1;
      const baseline = current ? (JSON.parse(current.baseline_json) as OpsKpi) : null;
      const payload = buildOperationsBody(sources, now, baseline);
      const baselineJson = JSON.stringify(payload.kpi.baseline);
      if (current) {
        execute(
          db,
          `UPDATE operations_state SET version = ?, source_hash = ?, payload_json = ?, built_at = ? WHERE organization_id = ? AND facility_id = ?`,
          version,
          hash,
          JSON.stringify(payload),
          builtAt,
          ctx.organizationId,
          facilityId,
        );
      } else {
        execute(
          db,
          `INSERT INTO operations_state (organization_id, facility_id, version, source_hash, payload_json, baseline_json, built_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          ctx.organizationId,
          facilityId,
          version,
          hash,
          JSON.stringify(payload),
          baselineJson,
          builtAt,
        );
      }
      execute(
        db,
        `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'operations.rebuild', ?, ?)`,
        randomUUID(),
        ctx.organizationId,
        JSON.stringify({ facilityId, version, sourceHash: hash }),
        builtAt,
      );
      stored = {
        version,
        source_hash: hash,
        payload_json: JSON.stringify(payload),
        baseline_json: current?.baseline_json ?? baselineJson,
        built_at: builtAt,
      };
    }
    const result = toView(facilityId, hash, stored, sources.overrides, false);
    writeAudit(db, ctx, { action: "operations.rebuild", resourceType: "OperationsState", resourceId: facilityId, outcome: "success" });
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

export function recordInventory(db: AppDatabase, ctx: SessionContext, input: { label: string; onHand: number; idempotencyKey: string }) {
  const facilityId = facilityOf(ctx);
  assertKey(input.idempotencyKey);
  const label = clean(input.label, 2, 80);
  if (!Number.isInteger(input.onHand) || input.onHand < 0 || input.onHand > 100000) throw new ValidationError();
  const hash = canonicalHash({ facilityId, label, onHand: input.onHand });
  const existing = replay<{ inventoryId: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const inventoryId = `inv_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { inventoryId };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO operations_inventory (id, organization_id, facility_id, label, on_hand, author_id, recorded_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      inventoryId,
      ctx.organizationId,
      facilityId,
      label,
      input.onHand,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "operations.inventory", { inventoryId, facilityId }, now);
    writeAudit(db, ctx, { action: "operations.inventory", resourceType: "OperationsInventory", resourceId: inventoryId, outcome: "success" });
  });
  return saved;
}

export function overrideOperations(
  db: AppDatabase,
  ctx: SessionContext,
  input: { kind: string; reason: string; idempotencyKey: string },
) {
  const facilityId = facilityOf(ctx);
  assertKey(input.idempotencyKey);
  if (!isKind(input.kind)) throw new ValidationError("code");
  const reason = clean(input.reason, 8, 240);
  const hash = canonicalHash({ facilityId, kind: input.kind, action: "hold", reason });
  const existing = replay<{ overrideId: string; kind: OpsKind; action: "hold"; reason: string }>(db, ctx, input.idempotencyKey, hash);
  if (existing) return existing;
  const overrideId = `ovr_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { overrideId, kind: input.kind, action: "hold" as const, reason };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO operations_overrides (id, organization_id, facility_id, kind, action, reason, author_id, created_at) VALUES (?, ?, ?, ?, 'hold', ?, ?, ?)`,
      overrideId,
      ctx.organizationId,
      facilityId,
      input.kind,
      reason,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "operations.override", { overrideId, facilityId }, now);
    writeAudit(db, ctx, { action: "operations.override", resourceType: "OperationsOverride", resourceId: overrideId, outcome: "success" });
  });
  return saved;
}

export function explainOperations(db: AppDatabase, ctx: SessionContext, input: { idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  const view = readOperations(db, ctx);
  const gateway = invokeGateway(
    db,
    ctx,
    {
      promptId: GATEWAY_PROMPT.id,
      promptVersion: GATEWAY_PROMPT.version,
      text: "Explain the listed operations identifiers.",
      idempotencyKey: input.idempotencyKey,
    },
    adapter,
  );
  return {
    recommendations: (view.state?.recommendations ?? []).map((item) => ({ ...item, text: holdOperationsText(item.text, gateway.output) })),
    kpiText: holdOperationsText(view.state?.kpi.text ?? "", gateway.output),
    aiOutcome: gateway.outcome,
    aiText: null,
  };
}
