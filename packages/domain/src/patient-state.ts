import { randomUUID } from "node:crypto";
import type { Chart, PatientStateBody, PatientStateView, SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { formatQuantity } from "./catalog";
import { getChart } from "./chart";
import { get, run, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { syncPatientEvidence } from "./evidence";
import { canReadChart } from "./session";

type BuildRow = {
  version: number;
  source_hash: string;
  payload_json: string;
  built_at: string;
};

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function byId<T extends { id: string }>(rows: T[]) {
  return [...rows].sort((a, b) => a.id.localeCompare(b.id));
}

export function patientSourceHash(chart: Chart) {
  return canonicalHash({
    patientId: chart.patient.id,
    version: chart.patient.version,
    conditions: byId(chart.conditions).map((item) => ({
      id: item.id,
      code: item.code,
      display: item.display,
      clinicalStatus: item.clinicalStatus,
    })),
    allergies: byId(chart.allergies).map((item) => ({ id: item.id, display: item.display, reaction: item.reaction })),
    medications: byId(chart.medications).map((item) => ({ id: item.id, display: item.display, dose: item.dose, status: item.status })),
    observations: byId(chart.observations).map((item) => ({
      id: item.id,
      code: item.code,
      value: item.value,
      effectiveAt: item.effectiveAt,
      interpretation: item.interpretation,
      encounterId: item.encounterId,
    })),
    encounters: byId(chart.encounters).map((item) => ({
      id: item.id,
      status: item.status,
      version: item.version,
      endedAt: item.endedAt,
    })),
    appointments: byId(chart.appointments).map((item) => ({
      id: item.id,
      status: item.status,
      startsAt: item.startsAt,
      reason: item.reason,
    })),
  });
}

export function buildPatientState(chart: Chart): PatientStateBody {
  const problems = chart.conditions
    .filter((item) => item.clinicalStatus === "active")
    .map((item) => ({
      sourceId: item.id,
      sourceTable: "conditions" as const,
      text: `${item.display} · ${item.code}`,
    }));
  const problemGroups = new Map<string, typeof chart.conditions>();
  for (const item of chart.conditions.filter((row) => row.clinicalStatus === "active")) {
    const list = problemGroups.get(item.code) ?? [];
    list.push(item);
    problemGroups.set(item.code, list);
  }
  const conflicts: PatientStateBody["conflicts"] = [];
  for (const [code, rows] of problemGroups) {
    if (rows.length < 2) continue;
    conflicts.push({
      kind: "duplicate-problem",
      code,
      text: `${rows.length} active problem rows use ${code}. Each row stays on the record.`,
      sources: rows.map((row) => ({ sourceId: row.id, sourceTable: "conditions" as const })),
    });
  }

  const byCode = new Map<string, typeof chart.observations>();
  for (const item of chart.observations) {
    const list = byCode.get(item.code) ?? [];
    list.push(item);
    byCode.set(item.code, list);
  }
  const recentResults: PatientStateBody["recentResults"] = [];
  for (const [code, rows] of byCode) {
    const newest = rows.reduce((latest, row) => (row.effectiveAt > latest ? row.effectiveAt : latest), rows[0].effectiveAt);
    const atNewest = rows.filter((row) => row.effectiveAt === newest);
    if (atNewest.length > 1) {
      conflicts.push({
        kind: "duplicate-result",
        code,
        text: `${atNewest.length} stored values for ${atNewest[0].display} at ${newest}. None is dropped.`,
        sources: atNewest.map((row) => ({ sourceId: row.id, sourceTable: "observations" as const })),
      });
      continue;
    }
    const row = atNewest[0];
    const flag = row.interpretation === "normal" ? "" : ` · ${row.thresholdText}`;
    recentResults.push({
      sourceId: row.id,
      sourceTable: "observations",
      text: `Latest stored result · ${row.display} · ${formatQuantity(row.value)} ${row.unit}${flag}`,
    });
  }

  const openEncounters = chart.encounters.filter((item) => item.status === "in-progress");
  const careGaps: PatientStateBody["careGaps"] = [];
  for (const item of recentResults) {
    const source = chart.observations.find((row) => row.id === item.sourceId);
    if (!source || source.interpretation === "normal") continue;
    careGaps.push({
      sourceId: source.id,
      sourceTable: "observations",
      text: `${source.display} · ${formatQuantity(source.value)} ${source.unit} is the latest stored result. ${source.thresholdText}.`,
    });
  }
  for (const item of chart.appointments.filter((row) => row.status === "booked")) {
    if (openEncounters.length > 0) continue;
    careGaps.push({
      sourceId: item.id,
      sourceTable: "appointments",
      text: `Booked appointment · ${item.reason}. No open encounter is stored.`,
    });
  }
  for (const item of openEncounters) {
    const linked = chart.observations.some((row) => row.encounterId === item.id);
    if (linked) continue;
    careGaps.push({
      sourceId: item.id,
      sourceTable: "encounters",
      text: `Open encounter · ${item.reason}. No result is stored on this encounter.`,
    });
  }

  const pending: PatientStateBody["pending"] = [
    ...openEncounters.map((item) => ({
      sourceId: item.id,
      sourceTable: "encounters" as const,
      text: `Open encounter · ${item.reason}`,
    })),
    ...chart.appointments
      .filter((item) => item.status === "booked")
      .map((item) => ({
        sourceId: item.id,
        sourceTable: "appointments" as const,
        text: `Booked appointment · ${item.reason}`,
      })),
  ];

  const sortItems = (items: PatientStateBody["problems"]) => items.sort((a, b) => a.sourceId.localeCompare(b.sourceId));
  return {
    problems: sortItems(problems),
    medications: sortItems(
      chart.medications
        .filter((item) => item.status === "active")
        .map((item) => ({
          sourceId: item.id,
          sourceTable: "medications" as const,
          text: `${item.display} · ${item.dose}`,
        })),
    ),
    allergies: sortItems(
      chart.allergies.map((item) => ({
        sourceId: item.id,
        sourceTable: "allergies" as const,
        text: `${item.display} · ${item.reaction}`,
      })),
    ),
    recentResults: sortItems(recentResults),
    conflicts: conflicts.sort((a, b) => a.code.localeCompare(b.code)),
    careGaps: sortItems(careGaps),
    pending: sortItems(pending),
    riskSignals: [
      {
        slot: "deterioration",
        status: "unfilled",
        text: "No score is stored. This slice does not calculate risk.",
      },
    ],
  };
}

function viewFrom(patientId: string, currentSourceHash: string, row: BuildRow | undefined): PatientStateView {
  if (!row) {
    return {
      patientId,
      built: false,
      version: null,
      builtAt: null,
      sourceHash: null,
      currentSourceHash,
      stale: true,
      state: null,
    };
  }
  return {
    patientId,
    built: true,
    version: row.version,
    builtAt: row.built_at,
    sourceHash: row.source_hash,
    currentSourceHash,
    stale: row.source_hash !== currentSourceHash,
    state: JSON.parse(row.payload_json) as PatientStateBody,
  };
}

function latestBuild(db: AppDatabase, ctx: SessionContext, patientId: string) {
  return get<BuildRow>(
    db,
    `SELECT version, source_hash, payload_json, built_at FROM patient_state_builds
     WHERE organization_id = ? AND facility_id = ? AND patient_id = ?
     ORDER BY version DESC LIMIT 1`,
    ctx.organizationId,
    ctx.facilityId,
    patientId,
  );
}

export function patientStateFromChart(db: AppDatabase, ctx: SessionContext, chart: Chart): PatientStateView {
  if (!canReadChart(ctx) || !ctx.facilityId) throw new ForbiddenError();
  const currentSourceHash = patientSourceHash(chart);
  const row = latestBuild(db, ctx, chart.patient.id);
  writeAudit(db, ctx, { action: "patient_state.read", resourceType: "PatientState", resourceId: chart.patient.id, outcome: "success" });
  return viewFrom(chart.patient.id, currentSourceHash, row);
}

export function readPatientState(db: AppDatabase, ctx: SessionContext, patientId: string, now = new Date()): PatientStateView | null {
  const chart = getChart(db, ctx, patientId, now);
  if (!chart) return null;
  return patientStateFromChart(db, ctx, chart);
}

type IdemRow = { request_hash: string; response_json: string };

export function rebuildPatientState(db: AppDatabase, ctx: SessionContext, patientId: string, idempotencyKey: string, now = new Date()) {
  if (!canReadChart(ctx) || !ctx.facilityId) {
    writeAudit(db, ctx, { action: "patient_state.rebuild", resourceType: "PatientState", resourceId: patientId, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertKey(idempotencyKey);
  const chart = getChart(db, ctx, patientId, now);
  if (!chart) throw new NotFoundError();
  const sourceHash = patientSourceHash(chart);
  const requestHash = canonicalHash({ patientId, sourceHash });
  return transaction(db, () => {
    const existingKey = get<IdemRow>(
      db,
      `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
      ctx.organizationId,
      idempotencyKey,
    );
    if (existingKey) {
      if (existingKey.request_hash !== requestHash) {
        throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
      }
      return JSON.parse(existingKey.response_json) as PatientStateView;
    }
    const current = latestBuild(db, ctx, patientId);
    const builtAt = new Date().toISOString();
    let stored = current;
    if (!current || current.source_hash !== sourceHash) {
      const version = (current?.version ?? 0) + 1;
      const payload = buildPatientState(chart);
      run(
        db,
        `INSERT INTO patient_state_builds (id, organization_id, facility_id, patient_id, version, source_hash, payload_json, author_id, built_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        randomUUID(),
        ctx.organizationId,
        ctx.facilityId,
        patientId,
        version,
        sourceHash,
        JSON.stringify(payload),
        ctx.userId,
        builtAt,
      );
      run(
        db,
        `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, 'patient_state.rebuilt', ?, ?)`,
        randomUUID(),
        ctx.organizationId,
        JSON.stringify({ organizationId: ctx.organizationId, facilityId: ctx.facilityId, patientId, version, sourceHash }),
        builtAt,
      );
      stored = { version, source_hash: sourceHash, payload_json: JSON.stringify(payload), built_at: builtAt };
    }
    if (!stored) throw new NotFoundError();
    syncPatientEvidence(db, ctx, chart, JSON.parse(stored.payload_json) as PatientStateBody);
    const result = viewFrom(patientId, sourceHash, stored);
    writeAudit(db, ctx, { action: "patient_state.rebuild", resourceType: "PatientState", resourceId: patientId, outcome: "success" });
    run(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
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
