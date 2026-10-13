import { randomUUID } from "node:crypto";
import type {
  AuditEntry,
  Chart,
  CompleteEncounterInput,
  NewEncounterInput,
  NewObservationInput,
  NewPatientInput,
  PatientSummary,
  PatientTimeline,
  SessionContext,
  Sex,
  TimelineGroup,
  Worklist,
} from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { ageInYears, buildBriefing, canonicalHash, filterTimeline, groupTimelineByDay, isTimelineGroup, projectTimeline, utcDate } from "./briefing";
import { interpretEntry, formatQuantity } from "./catalog";
import { deviceMeasurementsWithoutObservation } from "./devices";
import { codeSystemLabel, resolveFacilityConcept } from "./terminology";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { canReadChart, canRegisterPatient, canReviewAudit } from "./session";

type ObservationRecorded = (db: AppDatabase, ctx: SessionContext, observationId: string) => void;
let observationRecorded: ObservationRecorded = () => {};

export function registerObservationRecorded(fn: ObservationRecorded) {
  observationRecorded = fn;
}

type PatientRow = {
  id: string;
  organization_id: string;
  facility_id: string;
  mrn: string;
  given_name: string;
  family_name: string;
  birth_date: string;
  sex: Sex;
  confidentiality: string;
  retention_class: string;
  version: number;
  recorded_at: string;
};

type IdemRow = { request_hash: string; response_json: string };

function assertFacility(ctx: SessionContext): asserts ctx is SessionContext & { facilityId: string } {
  if (!ctx.facilityId) throw new ForbiddenError();
}

function readIdem<T>(db: AppDatabase, organizationId: string, key: string, hash: string): T | undefined {
  const row = get<IdemRow>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    organizationId,
    key,
  );
  if (!row) return undefined;
  if (row.request_hash !== hash) {
    throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  }
  return JSON.parse(row.response_json) as T;
}

function saveIdem(db: AppDatabase, ctx: SessionContext, key: string, hash: string, response: unknown) {
  run(
    db,
    `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ctx.organizationId,
    key,
    ctx.userId,
    hash,
    JSON.stringify(response),
    new Date().toISOString(),
  );
}

function publish(db: AppDatabase, ctx: SessionContext, eventType: string, payload: unknown) {
  run(
    db,
    `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    ctx.organizationId,
    eventType,
    JSON.stringify(payload),
    new Date().toISOString(),
  );
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function cleanName(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 1 || trimmed.length > 80) throw new ValidationError();
  return trimmed;
}

function cleanReason(value: string) {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (trimmed.length < 3 || trimmed.length > 200) throw new ValidationError();
  return trimmed;
}

function assertBirthDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError();
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new ValidationError();
  if (parsed.getTime() > Date.now() || parsed.getUTCFullYear() < 1900) throw new ValidationError();
}

function assertSex(value: string): Sex {
  if (value === "female" || value === "male" || value === "other" || value === "unknown") return value;
  throw new ValidationError();
}

function summary(row: PatientRow, now?: Date): PatientSummary {
  return {
    id: row.id,
    mrn: row.mrn,
    givenName: row.given_name,
    familyName: row.family_name,
    birthDate: row.birth_date,
    sex: row.sex,
    ageYears: ageInYears(row.birth_date, now),
  };
}

export function listPatients(db: AppDatabase, ctx: SessionContext, query = "", now = new Date()): PatientSummary[] {
  if (!canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "patient.list", resourceType: "Patient", resourceId: null, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertFacility(ctx);
  const q = query.trim().toLowerCase().replace(/[%_]/g, "");
  const like = `%${q}%`;
  const rows = all<PatientRow>(
    db,
    `SELECT * FROM patients
     WHERE organization_id = ? AND facility_id = ?
       AND (? = '' OR lower(given_name) LIKE ? OR lower(family_name) LIKE ? OR lower(mrn) LIKE ?)
     ORDER BY family_name, given_name`,
    ctx.organizationId,
    ctx.facilityId,
    q,
    like,
    like,
    like,
  );
  writeAudit(db, ctx, { action: "patient.list", resourceType: "Patient", resourceId: null, outcome: "success" });
  return rows.map((row) => summary(row, now));
}

export function listWorklist(db: AppDatabase, ctx: SessionContext, now = new Date()): Worklist {
  if (!canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "worklist.read", resourceType: "Worklist", resourceId: null, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertFacility(ctx);
  const date = utcDate(now);
  const appointments = all<{
    id: string;
    patient_id: string;
    given_name: string;
    family_name: string;
    mrn: string;
    reason: string;
    starts_at: string;
    status: string;
  }>(
    db,
    `SELECT a.id, a.patient_id, p.given_name, p.family_name, p.mrn, a.reason, a.starts_at, a.status
     FROM appointments a
     JOIN patients p ON p.id = a.patient_id
     WHERE a.organization_id = ? AND a.facility_id = ? AND substr(a.starts_at, 1, 10) = ?
     ORDER BY a.starts_at`,
    ctx.organizationId,
    ctx.facilityId,
    date,
  );
  const openEncounters = all<{
    id: string;
    patient_id: string;
    given_name: string;
    family_name: string;
    mrn: string;
    reason: string;
    started_at: string;
    version: number;
  }>(
    db,
    `SELECT e.id, e.patient_id, p.given_name, p.family_name, p.mrn, e.reason, e.started_at, e.version
     FROM encounters e
     JOIN patients p ON p.id = e.patient_id
     WHERE e.organization_id = ? AND e.facility_id = ? AND e.status = 'in-progress'
     ORDER BY e.started_at`,
    ctx.organizationId,
    ctx.facilityId,
  );
  writeAudit(db, ctx, { action: "worklist.read", resourceType: "Worklist", resourceId: null, outcome: "success" });
  return {
    date,
    appointments: appointments.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      patientName: `${row.given_name} ${row.family_name}`,
      mrn: row.mrn,
      reason: row.reason,
      startsAt: row.starts_at,
      status: row.status,
    })),
    openEncounters: openEncounters.map((row) => ({
      id: row.id,
      patientId: row.patient_id,
      patientName: `${row.given_name} ${row.family_name}`,
      mrn: row.mrn,
      reason: row.reason,
      startedAt: row.started_at,
      version: row.version,
    })),
  };
}

export function getChart(db: AppDatabase, ctx: SessionContext, patientId: string, now = new Date()): Chart | null {
  if (!canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "patient.read", resourceType: "Patient", resourceId: patientId, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertFacility(ctx);
  const patient = get<PatientRow>(db, `SELECT * FROM patients WHERE id = ?`, patientId);
  if (!patient) {
    writeAudit(db, ctx, { action: "patient.read", resourceType: "Patient", resourceId: patientId, outcome: "not_found" });
    return null;
  }
  if (patient.organization_id !== ctx.organizationId || patient.facility_id !== ctx.facilityId) {
    writeAudit(db, ctx, { action: "patient.read", resourceType: "Patient", resourceId: patientId, outcome: "denied" });
    return null;
  }
  const scope = [patientId, ctx.organizationId, ctx.facilityId] as const;
  const conditions = all<{
    id: string;
    code: string;
    code_system: string;
    code_system_version: string;
    display: string;
    clinical_status: string;
    recorded_at: string;
  }>(
    db,
    `SELECT id, code, code_system, code_system_version, display, clinical_status, recorded_at FROM conditions
     WHERE patient_id = ? AND organization_id = ? AND facility_id = ? ORDER BY recorded_at`,
    ...scope,
  );
  const allergies = all<{ id: string; display: string; reaction: string; criticality: string; recorded_at: string }>(
    db,
    `SELECT id, display, reaction, criticality, recorded_at FROM allergies
     WHERE patient_id = ? AND organization_id = ? AND facility_id = ? ORDER BY recorded_at`,
    ...scope,
  );
  const medications = all<{ id: string; display: string; dose: string; status: string; recorded_at: string }>(
    db,
    `SELECT id, display, dose, status, recorded_at FROM medications
     WHERE patient_id = ? AND organization_id = ? AND facility_id = ? ORDER BY recorded_at`,
    ...scope,
  );
  const observations = all<{
    id: string;
    code: string;
    display: string;
    value: number;
    unit: string;
    code_system: string;
    code_system_version: string;
    unit_system_version: string;
    binding_version: string;
    interpretation: "normal" | "high" | "low";
    threshold_text: string;
    effective_at: string;
    author_name: string;
    encounter_id: string | null;
  }>(
    db,
    `SELECT o.id, o.code, o.display, o.value, o.unit, o.code_system, o.code_system_version, o.unit_system_version, o.binding_version,
            o.interpretation, o.threshold_text, o.effective_at, o.encounter_id, u.display_name AS author_name
     FROM observations o JOIN users u ON u.id = o.author_id
     WHERE o.patient_id = ? AND o.organization_id = ? AND o.facility_id = ?
     ORDER BY o.effective_at DESC`,
    ...scope,
  );
  const encounters = all<{
    id: string;
    status: "in-progress" | "finished" | "cancelled";
    reason: string;
    started_at: string;
    ended_at: string | null;
    version: number;
    author_name: string;
  }>(
    db,
    `SELECT e.id, e.status, e.reason, e.started_at, e.ended_at, e.version, u.display_name AS author_name
     FROM encounters e JOIN users u ON u.id = e.author_id
     WHERE e.patient_id = ? AND e.organization_id = ? AND e.facility_id = ?
     ORDER BY e.started_at DESC`,
    ...scope,
  );
  const appointments = all<{ id: string; reason: string; starts_at: string; status: string }>(
    db,
    `SELECT id, reason, starts_at, status FROM appointments
     WHERE patient_id = ? AND organization_id = ? AND facility_id = ?`,
    ...scope,
  );
  const mappedObservations = observations.map((row) => ({
    id: row.id,
    code: row.code,
    display: row.display,
    value: row.value,
    unit: row.unit,
    interpretation: row.interpretation,
    codeSystemLabel: codeSystemLabel(row.code_system),
    codeSystemVersion: row.code_system_version,
    unitSystemVersion: row.unit_system_version,
    bindingVersion: row.binding_version,
    thresholdText: row.threshold_text,
    effectiveAt: row.effective_at,
    authorName: row.author_name,
    encounterId: row.encounter_id,
  }));
  const mappedEncounters = encounters.map((row) => ({
    id: row.id,
    status: row.status,
    reason: row.reason,
    startedAt: row.started_at,
    endedAt: row.ended_at,
    version: row.version,
    authorName: row.author_name,
  }));
  const mappedConditions = conditions.map((row) => ({
    id: row.id,
    display: row.display,
    code: row.code,
    codeSystemLabel: codeSystemLabel(row.code_system),
    codeSystemVersion: row.code_system_version,
    clinicalStatus: row.clinical_status,
    recordedAt: row.recorded_at,
  }));
  const timeline = projectTimeline({
    encounters: mappedEncounters,
    conditions: mappedConditions,
    allergies: allergies.map((row) => ({ ...row, recordedAt: row.recorded_at })),
    medications: medications.map((row) => ({ ...row, recordedAt: row.recorded_at })),
    observations: mappedObservations,
    appointments: appointments.map((row) => ({ id: row.id, reason: row.reason, startsAt: row.starts_at, status: row.status })),
    deviceReadings: deviceMeasurementsWithoutObservation(db, ctx.organizationId, ctx.facilityId, patientId),
  });
  const briefing = buildBriefing({
    encounters: mappedEncounters,
    observations: mappedObservations,
    conditions: mappedConditions,
  });
  writeAudit(db, ctx, { action: "patient.read", resourceType: "Patient", resourceId: patientId, outcome: "success" });
  return {
    patient: {
      ...summary(patient, now),
      version: patient.version,
      confidentiality: patient.confidentiality,
      retentionClass: patient.retention_class,
      recordedAt: patient.recorded_at,
    },
    allergies: allergies.map((row) => ({
      id: row.id,
      display: row.display,
      reaction: row.reaction,
      criticality: row.criticality,
    })),
    conditions: mappedConditions,
    medications: medications.map((row) => ({ id: row.id, display: row.display, dose: row.dose, status: row.status })),
    observations: mappedObservations,
    encounters: mappedEncounters,
    timeline,
    briefing,
    appointments: appointments.map((row) => ({
      id: row.id,
      reason: row.reason,
      startsAt: row.starts_at,
      status: row.status,
    })),
  };
}

export function readPatientTimeline(
  db: AppDatabase,
  ctx: SessionContext,
  patientId: string,
  group: string,
  now = new Date(),
): PatientTimeline | null {
  if (!isTimelineGroup(group)) throw new ValidationError("invalid", "That timeline filter is not available.");
  const chart = getChart(db, ctx, patientId, now);
  if (!chart) return null;
  const selected = group as TimelineGroup;
  const events = filterTimeline(chart.timeline, selected);
  writeAudit(db, ctx, { action: "timeline.read", resourceType: "Timeline", resourceId: patientId, outcome: "success" });
  return {
    patientId,
    group: selected,
    projectedAt: now.toISOString(),
    since: chart.briefing.since,
    events,
    days: groupTimelineByDay(events),
    changes: chart.briefing.items,
  };
}

function nextMrn(db: AppDatabase, facilityId: string) {
  const facility = get<{ name: string }>(db, `SELECT name FROM facilities WHERE id = ?`, facilityId);
  const prefix = (facility?.name.split(/\s+/)[0] ?? "Fac").slice(0, 3).toUpperCase();
  const count = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM patients WHERE facility_id = ?`, facilityId);
  return `${prefix}-${1000 + Number(count?.c ?? 0) + 1}`;
}

export function createPatient(db: AppDatabase, ctx: SessionContext, input: NewPatientInput) {
  if (!canRegisterPatient(ctx)) {
    writeAudit(db, ctx, { action: "patient.create", resourceType: "Patient", resourceId: null, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertFacility(ctx);
  assertKey(input.idempotencyKey);
  const givenName = cleanName(input.givenName);
  const familyName = cleanName(input.familyName);
  assertBirthDate(input.birthDate);
  const sex = assertSex(input.sex);
  const hash = canonicalHash({ givenName, familyName, birthDate: input.birthDate, sex });
  return transaction(db, () => {
    const replay = readIdem<{ id: string; mrn: string }>(db, ctx.organizationId, input.idempotencyKey, hash);
    if (replay) return replay;
    const id = randomUUID();
    const mrn = nextMrn(db, ctx.facilityId);
    const now = new Date().toISOString();
    run(
      db,
      `INSERT INTO patients (id, organization_id, facility_id, mrn, given_name, family_name, birth_date, sex, confidentiality, retention_class, version, author_id, recorded_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'normal', 'clinical-standard', 1, ?, ?)`,
      id,
      ctx.organizationId,
      ctx.facilityId,
      mrn,
      givenName,
      familyName,
      input.birthDate,
      sex,
      ctx.userId,
      now,
    );
    const created = { id, mrn };
    publish(db, ctx, "patient.registered", { organizationId: ctx.organizationId, facilityId: ctx.facilityId, patientId: id });
    writeAudit(db, ctx, { action: "patient.create", resourceType: "Patient", resourceId: id, outcome: "success" });
    saveIdem(db, ctx, input.idempotencyKey, hash, created);
    return created;
  });
}

export function mirrorPatient(
  db: AppDatabase,
  ctx: SessionContext,
  patient: { id: string; mrn: string; givenName: string; familyName: string; birthDate: string; sex: Sex },
) {
  if (!canRegisterPatient(ctx)) throw new ForbiddenError();
  assertFacility(ctx);
  if (!/^pat_[A-Za-z0-9-]{1,80}$/.test(patient.id)) throw new ValidationError();
  const givenName = cleanName(patient.givenName);
  const familyName = cleanName(patient.familyName);
  assertBirthDate(patient.birthDate);
  const sex = assertSex(patient.sex);
  const existing = get<PatientRow>(db, `SELECT * FROM patients WHERE id = ?`, patient.id);
  if (existing) {
    if (existing.organization_id !== ctx.organizationId || existing.facility_id !== ctx.facilityId) throw new ForbiddenError();
    return;
  }
  run(
    db,
    `INSERT INTO patients (id, organization_id, facility_id, mrn, given_name, family_name, birth_date, sex, confidentiality, retention_class, version, author_id, recorded_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'normal', 'clinical-standard', 1, ?, ?)`,
    patient.id,
    ctx.organizationId,
    ctx.facilityId,
    patient.mrn,
    givenName,
    familyName,
    patient.birthDate,
    sex,
    ctx.userId,
    new Date().toISOString(),
  );
}

export function mirrorEncounter(
  db: AppDatabase,
  ctx: SessionContext,
  encounter: { id: string; patientId: string; reason: string; startedAt: string },
) {
  if (!canReadChart(ctx)) throw new ForbiddenError();
  assertFacility(ctx);
  if (!/^enc_[A-Za-z0-9_-]{1,80}$/.test(encounter.id)) throw new ValidationError();
  const reason = cleanReason(encounter.reason);
  requireVisiblePatient(db, ctx, encounter.patientId);
  const existing = get<{ organization_id: string; facility_id: string }>(
    db,
    `SELECT organization_id, facility_id FROM encounters WHERE id = ?`,
    encounter.id,
  );
  if (existing) {
    if (existing.organization_id !== ctx.organizationId || existing.facility_id !== ctx.facilityId) throw new ForbiddenError();
    return;
  }
  run(
    db,
    `INSERT INTO encounters (id, organization_id, facility_id, patient_id, status, class, reason, started_at, ended_at, author_id, version, recorded_at)
     VALUES (?, ?, ?, ?, 'in-progress', 'ambulatory', ?, ?, NULL, ?, 1, ?)`,
    encounter.id,
    ctx.organizationId,
    ctx.facilityId,
    encounter.patientId,
    reason,
    encounter.startedAt,
    ctx.userId,
    encounter.startedAt,
  );
}

export function mirrorFinishedEncounter(
  db: AppDatabase,
  ctx: SessionContext,
  encounter: { id: string; version: number; endedAt: string },
) {
  if (!canReadChart(ctx)) throw new ForbiddenError();
  assertFacility(ctx);
  if (!/^enc_[A-Za-z0-9_-]{1,80}$/.test(encounter.id) || !Number.isInteger(encounter.version)) throw new ValidationError();
  const row = get<{ status: string; version: number; organization_id: string; facility_id: string }>(
    db,
    `SELECT status, version, organization_id, facility_id FROM encounters WHERE id = ?`,
    encounter.id,
  );
  if (!row || row.organization_id !== ctx.organizationId || row.facility_id !== ctx.facilityId) throw new NotFoundError();
  if (row.status === "finished" && row.version === encounter.version) return;
  if (row.status !== "in-progress") throw new ConflictError("conflict", "Only an open encounter can be finished.");
  const result = run(
    db,
    `UPDATE encounters SET status = 'finished', ended_at = ?, version = ? WHERE id = ? AND status = 'in-progress'`,
    encounter.endedAt,
    encounter.version,
    encounter.id,
  );
  if (Number(result.changes) !== 1) throw new ConflictError("conflict", "The record changed. Reload the chart.");
}

export function mirrorObservation(
  db: AppDatabase,
  ctx: SessionContext,
  observation: {
    id: string;
    patientId: string;
    code: string;
    display: string;
    value: number;
    unit: string;
    codeSystem: string;
    codeSystemVersion: string;
    unitSystemVersion: string;
    bindingVersion: string;
    interpretation: "normal" | "high" | "low";
    thresholdText: string;
    effectiveAt: string;
  },
) {
  if (!canReadChart(ctx)) throw new ForbiddenError();
  assertFacility(ctx);
  if (!/^obs_[A-Za-z0-9_-]{1,80}$/.test(observation.id)) throw new ValidationError();
  if (!Number.isFinite(observation.value)) throw new ValidationError();
  if (!observation.effectiveAt) throw new ValidationError();
  requireVisiblePatient(db, ctx, observation.patientId);
  const existing = get<{ organization_id: string; facility_id: string }>(
    db,
    `SELECT organization_id, facility_id FROM observations WHERE id = ?`,
    observation.id,
  );
  if (existing) {
    if (existing.organization_id !== ctx.organizationId || existing.facility_id !== ctx.facilityId) throw new ForbiddenError();
    return;
  }
  run(
    db,
    `INSERT INTO observations (id, organization_id, facility_id, patient_id, encounter_id, code, code_system, code_system_version, display, value, unit, unit_system_version, binding_version, interpretation, threshold_text, effective_at, author_id, recorded_at)
     VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    observation.id,
    ctx.organizationId,
    ctx.facilityId,
    observation.patientId,
    observation.code,
    observation.codeSystem,
    observation.codeSystemVersion,
    observation.display,
    observation.value,
    observation.unit,
    observation.unitSystemVersion,
    observation.bindingVersion,
    observation.interpretation,
    observation.thresholdText,
    observation.effectiveAt,
    ctx.userId,
    observation.effectiveAt,
  );
  observationRecorded(db, ctx, observation.id);
}

export function mirrorCondition(
  db: AppDatabase,
  ctx: SessionContext,
  condition: {
    id: string;
    patientId: string;
    code: string;
    display: string;
    codeSystem: string;
    codeSystemVersion: string;
    clinicalStatus: string;
    recordedAt: string;
  },
) {
  if (!canReadChart(ctx)) throw new ForbiddenError();
  assertFacility(ctx);
  if (!/^con_[A-Za-z0-9_-]{1,80}$/.test(condition.id)) throw new ValidationError();
  if (condition.clinicalStatus !== "active" || !condition.recordedAt) throw new ValidationError();
  requireVisiblePatient(db, ctx, condition.patientId);
  const existing = get<{ organization_id: string; facility_id: string }>(
    db,
    `SELECT organization_id, facility_id FROM conditions WHERE id = ?`,
    condition.id,
  );
  if (existing) {
    if (existing.organization_id !== ctx.organizationId || existing.facility_id !== ctx.facilityId) throw new ForbiddenError();
    return;
  }
  run(
    db,
    `INSERT INTO conditions (id, organization_id, facility_id, patient_id, code, code_system, code_system_version, display, clinical_status, recorded_at, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)`,
    condition.id,
    ctx.organizationId,
    ctx.facilityId,
    condition.patientId,
    condition.code,
    condition.codeSystem,
    condition.codeSystemVersion,
    condition.display,
    condition.recordedAt,
    ctx.userId,
  );
}

export function mirrorAllergy(
  db: AppDatabase,
  ctx: SessionContext,
  allergy: { id: string; patientId: string; display: string; reaction: string; criticality: string; recordedAt: string },
) {
  if (!canReadChart(ctx)) throw new ForbiddenError();
  assertFacility(ctx);
  if (!/^all_[A-Za-z0-9_-]{1,80}$/.test(allergy.id)) throw new ValidationError();
  if (allergy.criticality !== "low" && allergy.criticality !== "high") throw new ValidationError();
  if (!allergy.recordedAt) throw new ValidationError();
  requireVisiblePatient(db, ctx, allergy.patientId);
  const existing = get<{ organization_id: string; facility_id: string }>(
    db,
    `SELECT organization_id, facility_id FROM allergies WHERE id = ?`,
    allergy.id,
  );
  if (existing) {
    if (existing.organization_id !== ctx.organizationId || existing.facility_id !== ctx.facilityId) throw new ForbiddenError();
    return;
  }
  run(
    db,
    `INSERT INTO allergies (id, organization_id, facility_id, patient_id, display, reaction, criticality, recorded_at, author_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    allergy.id,
    ctx.organizationId,
    ctx.facilityId,
    allergy.patientId,
    allergy.display,
    allergy.reaction,
    allergy.criticality,
    allergy.recordedAt,
    ctx.userId,
  );
}

function requireVisiblePatient(db: AppDatabase, ctx: SessionContext & { facilityId: string }, patientId: string) {
  const patient = get<PatientRow>(db, `SELECT * FROM patients WHERE id = ?`, patientId);
  if (!patient) {
    writeAudit(db, ctx, { action: "patient.read", resourceType: "Patient", resourceId: patientId, outcome: "not_found" });
    throw new NotFoundError();
  }
  if (patient.organization_id !== ctx.organizationId || patient.facility_id !== ctx.facilityId) {
    writeAudit(db, ctx, { action: "patient.read", resourceType: "Patient", resourceId: patientId, outcome: "denied" });
    throw new NotFoundError();
  }
  return patient;
}

export function createEncounter(db: AppDatabase, ctx: SessionContext, input: NewEncounterInput) {
  if (!canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "encounter.create", resourceType: "Encounter", resourceId: null, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertFacility(ctx);
  assertKey(input.idempotencyKey);
  const reason = cleanReason(input.reason);
  const hash = canonicalHash({ patientId: input.patientId, reason });
  return transaction(db, () => {
    const replay = readIdem<{ id: string }>(db, ctx.organizationId, input.idempotencyKey, hash);
    if (replay) return replay;
    requireVisiblePatient(db, ctx, input.patientId);
    const open = get<{ id: string }>(
      db,
      `SELECT id FROM encounters WHERE patient_id = ? AND facility_id = ? AND status = 'in-progress'`,
      input.patientId,
      ctx.facilityId,
    );
    if (open) throw new ConflictError("open", "Finish the open encounter first.");
    const id = randomUUID();
    const now = new Date().toISOString();
    run(
      db,
      `INSERT INTO encounters (id, organization_id, facility_id, patient_id, status, class, reason, started_at, ended_at, author_id, version, recorded_at)
       VALUES (?, ?, ?, ?, 'in-progress', 'ambulatory', ?, ?, NULL, ?, 1, ?)`,
      id,
      ctx.organizationId,
      ctx.facilityId,
      input.patientId,
      reason,
      now,
      ctx.userId,
      now,
    );
    const created = { id };
    publish(db, ctx, "encounter.opened", { organizationId: ctx.organizationId, facilityId: ctx.facilityId, patientId: input.patientId, encounterId: id });
    writeAudit(db, ctx, { action: "encounter.create", resourceType: "Encounter", resourceId: id, outcome: "success" });
    saveIdem(db, ctx, input.idempotencyKey, hash, created);
    return created;
  });
}

export function completeEncounter(db: AppDatabase, ctx: SessionContext, input: CompleteEncounterInput) {
  if (!canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "encounter.complete", resourceType: "Encounter", resourceId: input.encounterId, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertFacility(ctx);
  assertKey(input.idempotencyKey);
  if (!Number.isInteger(input.expectedVersion)) throw new ValidationError();
  const hash = canonicalHash({ encounterId: input.encounterId, expectedVersion: input.expectedVersion });
  return transaction(db, () => {
    const replay = readIdem<{ id: string; version: number }>(db, ctx.organizationId, input.idempotencyKey, hash);
    if (replay) return replay;
    const row = get<{ id: string; patient_id: string; status: string; version: number }>(
      db,
      `SELECT id, patient_id, status, version FROM encounters WHERE id = ? AND organization_id = ? AND facility_id = ?`,
      input.encounterId,
      ctx.organizationId,
      ctx.facilityId,
    );
    if (!row) throw new NotFoundError();
    if (row.status !== "in-progress") throw new ConflictError("conflict", "Only an open encounter can be finished.");
    if (row.version !== input.expectedVersion) throw new ConflictError("conflict", "The record changed. Reload the chart.");
    const now = new Date().toISOString();
    const result = run(
      db,
      `UPDATE encounters SET status = 'finished', ended_at = ?, version = version + 1 WHERE id = ? AND version = ?`,
      now,
      input.encounterId,
      input.expectedVersion,
    );
    if (Number(result.changes) !== 1) throw new ConflictError("conflict", "The record changed. Reload the chart.");
    const updated = { id: row.id, version: row.version + 1 };
    publish(db, ctx, "encounter.finished", {
      organizationId: ctx.organizationId,
      facilityId: ctx.facilityId,
      patientId: row.patient_id,
      encounterId: row.id,
    });
    writeAudit(db, ctx, { action: "encounter.complete", resourceType: "Encounter", resourceId: row.id, outcome: "success" });
    saveIdem(db, ctx, input.idempotencyKey, hash, updated);
    return updated;
  });
}

export function recordObservation(db: AppDatabase, ctx: SessionContext, input: NewObservationInput) {
  if (!canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "observation.record", resourceType: "Observation", resourceId: null, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertFacility(ctx);
  assertKey(input.idempotencyKey);
  const entry = resolveFacilityConcept(db, ctx.facilityId, input.code);
  if (!entry) throw new ValidationError("code");
  if (!Number.isFinite(input.value) || input.value < entry.min || input.value > entry.max) throw new ValidationError("range");
  const judged = interpretEntry(entry, input.value);
  const supplied = input.observationId?.trim() ?? "";
  if (supplied && !/^obs_[A-Za-z0-9_-]{1,80}$/.test(supplied)) throw new ValidationError();
  const hash = canonicalHash({
    patientId: input.patientId,
    code: input.code,
    value: input.value,
    ...(supplied ? { observationId: supplied } : {}),
  });
  return transaction(db, () => {
    const replay = readIdem<{ id: string }>(db, ctx.organizationId, input.idempotencyKey, hash);
    if (replay) return replay;
    requireVisiblePatient(db, ctx, input.patientId);
    const id = supplied || randomUUID();
    const now = new Date().toISOString();
    run(
      db,
      `INSERT INTO observations (id, organization_id, facility_id, patient_id, encounter_id, code, code_system, code_system_version, display, value, unit, unit_system_version, binding_version, interpretation, threshold_text, effective_at, author_id, recorded_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      ctx.organizationId,
      ctx.facilityId,
      input.patientId,
      input.code,
      entry.system,
      entry.codeSystemVersion,
      entry.display,
      input.value,
      entry.unit,
      entry.unitSystemVersion,
      entry.bindingVersion,
      judged.interpretation,
      judged.thresholdText,
      now,
      ctx.userId,
      now,
    );
    const created = { id };
    publish(db, ctx, "observation.recorded", {
      organizationId: ctx.organizationId,
      facilityId: ctx.facilityId,
      patientId: input.patientId,
      observationId: id,
      code: input.code,
      codeSystemVersion: entry.codeSystemVersion,
    });
    observationRecorded(db, ctx, id);
    writeAudit(db, ctx, { action: "observation.record", resourceType: "Observation", resourceId: id, outcome: "success" });
    saveIdem(db, ctx, input.idempotencyKey, hash, created);
    return created;
  });
}

export function listAudit(db: AppDatabase, ctx: SessionContext): AuditEntry[] {
  if (!canReviewAudit(ctx)) {
    writeAudit(db, ctx, { action: "audit.read", resourceType: "AuditEvent", resourceId: null, outcome: "denied" });
    throw new ForbiddenError();
  }
  const rows = all<{
    id: string;
    created_at: string;
    actor_name: string;
    purpose_of_use: AuditEntry["purposeOfUse"];
    action: string;
    resource_type: string;
    resource_id: string | null;
    outcome: string;
  }>(
    db,
    `SELECT a.id, a.created_at, COALESCE(u.display_name, 'Patient record') AS actor_name, a.purpose_of_use, a.action, a.resource_type, a.resource_id, a.outcome
     FROM audit_events a LEFT JOIN users u ON u.id = a.actor_id
     WHERE a.organization_id = ?
     ORDER BY a.created_at DESC
     LIMIT 200`,
    ctx.organizationId,
  );
  writeAudit(db, ctx, { action: "audit.read", resourceType: "AuditEvent", resourceId: null, outcome: "success" });
  return rows.map((row) => ({
    id: row.id,
    createdAt: row.created_at,
    actorName: row.actor_name,
    purposeOfUse: row.purpose_of_use,
    action: row.action,
    resourceType: row.resource_type,
    resourceId: row.resource_id,
    outcome: row.outcome,
  }));
}

export function healthcheck(db: AppDatabase) {
  const row = get<{ version: number }>(db, `SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1`);
  return { ok: true as const, schemaVersion: row?.version ?? 0 };
}

export { formatQuantity };
