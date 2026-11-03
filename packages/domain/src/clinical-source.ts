import { codingCommandHash, codingDefinition, codingForAuthorizedSource, pinClinicalCoding, type CodingSelection } from "./clinical-coding";
import { randomUUID } from "node:crypto";
import { writeAudit } from "./audit";
import { authorize, effectivePermissions } from "./authorization";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import type { SessionContext } from "@curasphere/contracts";

export type SourceActor = { userId: string; organizationId: string; facilityId: string | null; sessionId: string };

const CONDITION_SYSTEM = { system: "curasphere.synthetic.condition", version: "2026.10" };
const ALLERGY_SYSTEM = { system: "curasphere.synthetic.allergy", version: "2026.10" };
const OBSERVATION_SYSTEM = { system: "curasphere.synthetic.observation", version: "2026.10" };
const MEDICATION_SYSTEM = { system: "curasphere.synthetic.medication", version: "2026.10" };
const UNIT_SYSTEM = "curasphere.synthetic.ucum-style/2026.10";

const CONDITIONS = [{ ...CONDITION_SYSTEM, code: "syn-follow-up", display: "Follow-up problem" }];
const ALLERGIES = [
  { ...ALLERGY_SYSTEM, code: "syn-penicillin", display: "Penicillin", category: "medication", finding: "documented" },
  { ...ALLERGY_SYSTEM, code: "syn-none-known", display: "No known allergies", category: "assessment", finding: "none-known" },
  { ...ALLERGY_SYSTEM, code: "syn-unknown", display: "Allergy status unknown", category: "assessment", finding: "unknown" },
];
const QUANTITIES = [
  { ...OBSERVATION_SYSTEM, code: "syn-temp", display: "Body temperature", category: "vital-sign", unit: "Cel", min: 30, max: 45 },
  { ...OBSERVATION_SYSTEM, code: "syn-hr", display: "Heart rate", category: "vital-sign", unit: "/min", min: 20, max: 250 },
  { ...OBSERVATION_SYSTEM, code: "syn-rr", display: "Respiratory rate", category: "vital-sign", unit: "/min", min: 5, max: 80 },
  { ...OBSERVATION_SYSTEM, code: "syn-spo2", display: "Oxygen saturation", category: "vital-sign", unit: "%", min: 50, max: 100 },
  { ...OBSERVATION_SYSTEM, code: "syn-weight", display: "Body weight", category: "vital-sign", unit: "kg", min: 0.5, max: 400 },
  { ...OBSERVATION_SYSTEM, code: "syn-height", display: "Body height", category: "vital-sign", unit: "cm", min: 30, max: 250 },
];
const PRESSURE = {
  ...OBSERVATION_SYSTEM,
  code: "syn-bp",
  display: "Blood pressure",
  category: "vital-sign" as const,
  components: [
    { code: "syn-sbp", display: "Systolic blood pressure", unit: "mm[Hg]", min: 40, max: 300 },
    { code: "syn-dbp", display: "Diastolic blood pressure", unit: "mm[Hg]", min: 20, max: 200 },
  ],
};
const MEDICATIONS = [{ ...MEDICATION_SYSTEM, code: "syn-paracetamol", display: "Paracetamol", unit: "mg", min: 1, max: 4000, route: "oral", frequency: "as-recorded" }];

const CLINICAL_NEXT: Record<string, string[]> = {
  active: ["resolved", "historical"],
  resolved: ["historical"],
  historical: [],
};
const VERIFICATION_NEXT: Record<string, string[]> = {
  unconfirmed: ["confirmed", "entered-in-error"],
  confirmed: ["entered-in-error"],
  "entered-in-error": [],
};
const ALLERGY_CLINICAL_NEXT: Record<string, string[]> = { active: ["inactive"], inactive: [] };
const ALLERGY_VERIFICATION_NEXT: Record<string, string[]> = {
  unconfirmed: ["confirmed", "refuted", "entered-in-error"],
  confirmed: ["refuted", "entered-in-error"],
  refuted: ["entered-in-error"],
  "entered-in-error": [],
};
const OBSERVATION_CORRECTABLE = new Set(["preliminary", "final", "corrected"]);

export function listSourceCatalog() {
  return {
    conditions: CONDITIONS,
    allergies: ALLERGIES,
    quantities: QUANTITIES,
    pressure: PRESSURE,
    medications: MEDICATIONS,
    unitSystem: UNIT_SYSTEM,
    conformance: "Local synthetic codes only. This is not SNOMED CT, LOINC, ICD, or UCUM conformance.",
  };
}

function requireOpen(db: AppDatabase) {
  const control = get<{ value: string }>(db, `SELECT value FROM source_controls WHERE name = 'dependency'`);
  if (!control || control.value !== "available") throw new ConflictError("conflict", "Clinical source recording is unavailable.");
}

function gate(db: AppDatabase, actor: SourceActor, permission: string) {
  requireOpen(db);
  if (!actor.sessionId || !actor.facilityId) throw new ForbiddenError();
  const permissions = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId).permissions;
  if (!permissions.includes(permission)) throw new ForbiddenError();
  const user = get<{ role: string; account_status:string }>(db, `SELECT role,account_status FROM users WHERE id = ?`, actor.userId);
  const purpose = user?.role === "auditor" ? "AUDIT" : user?.role === "admin" ? "OPERATIONS" : "TREATMENT";
  const decision = authorize(
    db,
    { principalId: actor.userId, accountActive: user?.account_status === "active" },
    permission,
    { type: "ClinicalSource", organizationId: actor.organizationId, facilityId: actor.facilityId, sensitivity: "clinical" },
    { purpose, assurance: "directory", sessionActive: true, activeFacilityId: actor.facilityId, correlationId: actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) },
  );
  if (!decision.allow) throw new ForbiddenError("forbidden", "Clinical source recording is not permitted for this session.");
}

function sessionFor(db: AppDatabase, actor: SourceActor): SessionContext {
  const user = get<{ display_name: string; role: SessionContext["role"]; organization_name: string; facility_name: string | null }>(
    db,
    `SELECT u.display_name, u.role, o.name AS organization_name, f.name AS facility_name
     FROM users u JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN facilities f ON f.id = ?
     WHERE u.id = ?`,
    actor.facilityId,
    actor.userId,
  );
  if (!user || !actor.facilityId) throw new ForbiddenError();
  const purpose = user.role === "admin" ? "OPERATIONS" : user.role === "auditor" ? "AUDIT" : "TREATMENT";
  return {
    sessionId: actor.sessionId,
    userId: actor.userId,
    displayName: user.display_name,
    role: user.role,
    purposeOfUse: purpose,
    organizationId: actor.organizationId,
    organizationName: user.organization_name,
    facilityId: actor.facilityId,
    facilityName: user.facility_name ?? "Facility",
  };
}

function countMetric(db: AppDatabase, name: string) {
  run(db, `INSERT INTO source_metrics (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1`, name);
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function readCommand<T>(db: AppDatabase, organizationId: string, key: string, hash: string): T | undefined {
  const row = get<{ request_hash: string; response_json: string }>(db, `SELECT request_hash, response_json FROM source_commands WHERE organization_id = ? AND command_key = ?`, organizationId, key);
  if (!row) return undefined;
  if (row.request_hash !== hash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  return JSON.parse(row.response_json) as T;
}

function saveCommand(db: AppDatabase, organizationId: string, key: string, hash: string, response: unknown) {
  run(db, `INSERT INTO source_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, organizationId, key, hash, JSON.stringify(response));
}

function assertPatient(db: AppDatabase, actor: SourceActor, patientId: string) {
  const patient = get<{ organization_id: string; facility_id: string; registration_status: string }>(db, `SELECT organization_id, facility_id, registration_status FROM patients WHERE id = ?`, patientId);
  if (!patient || patient.organization_id !== actor.organizationId) throw new NotFoundError("That patient is not available.");
  if (patient.registration_status === "merged") throw new ValidationError("invalid", "That patient is superseded. Use the surviving record.");
  if (patient.registration_status !== "active") throw new ValidationError("invalid", "That patient is not active.");
  const registered = patient.facility_id === actor.facilityId || get(db, `SELECT id FROM patient_facility_registrations WHERE patient_id = ? AND facility_id = ? AND status = 'active'`, patientId, actor.facilityId);
  if (!registered) throw new NotFoundError("That patient is not available.");
}

function assertPractitioner(db: AppDatabase, actor: SourceActor, practitionerId: string) {
  const practitioner = get<{ status: string; organization_id: string }>(db, `SELECT status, organization_id FROM practitioners WHERE id = ?`, practitionerId);
  if (!practitioner || practitioner.organization_id !== actor.organizationId) throw new NotFoundError("That practitioner is not available.");
  if (practitioner.status !== "active") throw new ConflictError("conflict", "That practitioner is not available.");
  const affiliation = get(db, `SELECT id FROM practitioner_affiliations WHERE practitioner_id = ? AND facility_id = ? AND status = 'active'`, practitionerId, actor.facilityId);
  if (!affiliation) throw new ValidationError("invalid", "That practitioner is not affiliated with this facility.");
}

function assertEncounter(db: AppDatabase, actor: SourceActor, encounterId: string, patientId: string, mode: "record" | "amend") {
  const row = get<{ patient_id: string; organization_id: string; facility_id: string; status: string }>(
    db,
    `SELECT patient_id, organization_id, facility_id, status FROM visit_encounters WHERE id = ?`,
    encounterId,
  );
  if (!row || row.organization_id !== actor.organizationId || row.facility_id !== actor.facilityId) throw new NotFoundError("That encounter is not available.");
  if (row.patient_id !== patientId) throw new ConflictError("conflict", "That encounter is not for this patient.");
  if (row.status === "completed" && mode === "record") throw new ConflictError("conflict", "That encounter is closed. Ordinary recording is not available.");
  if (row.status !== "in-progress" && row.status !== "completed") throw new ConflictError("conflict", "That encounter is not open for source entries.");
}

function remember(db: AppDatabase, actor: SourceActor, kind: string, recordId: string, version: number, prior: number | null, encounterId: string, reason: string | null, snapshot: unknown, now: string) {
  run(
    db,
    `INSERT INTO source_versions (id, organization_id, record_kind, record_id, version, prior_version, actor_id, facility_id, encounter_id, recorded_at, amended_at, reason, snapshot_json, correlation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    actor.organizationId,
    kind,
    recordId,
    version,
    prior,
    actor.userId,
    actor.facilityId,
    encounterId,
    now,
    prior === null ? null : now,
    reason,
    JSON.stringify(snapshot),
    actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
  );
}

function move(current: string, next: string, matrix: Record<string, string[]>, label: string) {
  if (current === next) return;
  if (!matrix[current]?.includes(next)) throw new ConflictError("conflict", `That ${label} change is not allowed.`);
}

function owned<T extends { organization_id: string; facility_id: string }>(db: AppDatabase, actor: SourceActor, sql: string, id: string) {
  const row = get<T>(db, sql, id);
  if (!row || row.organization_id !== actor.organizationId || row.facility_id !== actor.facilityId) throw new NotFoundError("That record is not available.");
  return row;
}

function history(db: AppDatabase, actor: SourceActor, kind: string, id: string) {
  if (!effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId).permissions.includes("clinical.source.history.read")) return [];
  return all<{ version: number; prior_version: number | null; actor_id: string; reason: string | null; snapshot_json: string; recorded_at: string; amended_at: string | null }>(
    db,
    `SELECT version, prior_version, actor_id, reason, snapshot_json, recorded_at, amended_at FROM source_versions WHERE organization_id = ? AND record_kind = ? AND record_id = ? ORDER BY version`,
    actor.organizationId,
    kind,
    id,
  ).map((row) => ({ ...row, snapshot: JSON.parse(row.snapshot_json) as Record<string, unknown>, snapshot_json: undefined }));
}

export function recordCondition(db: AppDatabase, actor: SourceActor, input: { patientId: string; encounterId: string; practitionerId: string; code: string; clinicalStatus: string; verificationStatus: string; onsetDate?: string; idempotencyKey: string; coding?: CodingSelection }) {
  gate(db, actor, "clinical.condition.record");
  assertKey(input.idempotencyKey);
  const hash = codingCommandHash(JSON.stringify(["condition", input.patientId, input.encounterId, input.code, input.clinicalStatus, input.verificationStatus, input.onsetDate ?? ""]),input.coding,actor);
  const prior = readCommand<{ id: string; version: number; verificationStatus: string; clinicalStatus: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const concept = CONDITIONS.find((item) => item.code === input.code);
  if (!concept) throw new ValidationError("code", "That code is not on the synthetic catalog.");
  if (input.clinicalStatus !== "active" && input.clinicalStatus !== "historical") throw new ValidationError("invalid", "That clinical status cannot be recorded directly.");
  if (input.verificationStatus !== "unconfirmed" && input.verificationStatus !== "confirmed") throw new ValidationError("invalid", "That verification status cannot be recorded directly.");
  if (input.onsetDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.onsetDate)) throw new ValidationError();
  return transaction(db, () => {
    const again=readCommand<{ id: string; version: number; verificationStatus: string; clinicalStatus: string }>(db,actor.organizationId,input.idempotencyKey,hash);
    if(again)return {...again,idempotent:true};
    assertPatient(db, actor, input.patientId);
    assertPractitioner(db, actor, input.practitionerId);
    assertEncounter(db, actor, input.encounterId, input.patientId, "record");
    const now = new Date().toISOString();
    const id = `cnd_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const snapshot = { code: concept.code, system: concept.system, version: concept.version, display: concept.display, clinicalStatus: input.clinicalStatus, verificationStatus: input.verificationStatus, onsetDate: input.onsetDate ?? null };
    run(
      db,
      `INSERT INTO source_conditions (id, organization_id, facility_id, patient_id, encounter_id, practitioner_id, code, code_system, code_system_version, display, clinical_status, verification_status, onset_date, resolution_date, recorded_at, recorded_by, version, correlation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, 1, ?, ?, ?)`,
      id, actor.organizationId, actor.facilityId, input.patientId, input.encounterId, input.practitionerId, concept.code, concept.system, concept.version, concept.display, input.clinicalStatus, input.verificationStatus, input.onsetDate ?? null, now, actor.userId, actor.sessionId.slice(0, 80), now, now,
    );
    remember(db, actor, "condition", id, 1, null, input.encounterId, null, snapshot, now);
    pinClinicalCoding(db,actor,"condition",id,codingDefinition("condition",concept),input.coding);
    writeAudit(db, sessionFor(db, actor), { action: "clinical.condition.record", resourceType: "Condition", resourceId: id, outcome: "success" });
    countMetric(db, "source.condition.recorded");
    const response = { id, version: 1, verificationStatus: input.verificationStatus, clinicalStatus: input.clinicalStatus };
    saveCommand(db, actor.organizationId, input.idempotencyKey, hash, response);
    return { ...response, idempotent: false };
  });
}

export function amendCondition(db: AppDatabase, actor: SourceActor, id: string, input: { expectedVersion: number; clinicalStatus?: string; verificationStatus?: string; resolutionDate?: string; reason: string; idempotencyKey: string }) {
  gate(db, actor, "clinical.condition.amend");
  assertKey(input.idempotencyKey);
  if (!input.reason || input.reason.length > 40 || !/^[a-z-]+$/.test(input.reason)) throw new ValidationError("invalid", "A correction reason is required.");
  const hash = JSON.stringify(["amend-condition", id, input.expectedVersion, input.clinicalStatus ?? "", input.verificationStatus ?? "", input.reason]);
  const prior = readCommand<{ id: string; version: number; clinicalStatus: string; verificationStatus: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  return transaction(db, () => {
    const row = owned<{ organization_id: string; facility_id: string; patient_id: string; encounter_id: string; code: string; code_system: string; code_system_version: string; display: string; clinical_status: string; verification_status: string; onset_date: string | null; version: number }>(db, actor, `SELECT * FROM source_conditions WHERE id = ?`, id);
    if (row.version !== input.expectedVersion) throw new ConflictError("conflict", "The record changed. Review the current version.");
    assertEncounter(db, actor, row.encounter_id, row.patient_id, "amend");
    const clinical = input.clinicalStatus ?? row.clinical_status;
    const verification = input.verificationStatus ?? row.verification_status;
    move(row.clinical_status, clinical, CLINICAL_NEXT, "clinical status");
    move(row.verification_status, verification, VERIFICATION_NEXT, "verification status");
    if (clinical === "resolved" && input.resolutionDate && !/^\d{4}-\d{2}-\d{2}$/.test(input.resolutionDate)) throw new ValidationError();
    const now = new Date().toISOString();
    const next = row.version + 1;
    const changed = run(db, `UPDATE source_conditions SET clinical_status = ?, verification_status = ?, resolution_date = COALESCE(?, resolution_date), version = ?, updated_at = ? WHERE id = ? AND version = ?`, clinical, verification, input.resolutionDate ?? null, next, now, id, row.version);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    remember(db, actor, "condition", id, next, row.version, row.encounter_id, input.reason, { code: row.code, system: row.code_system, version: row.code_system_version, display: row.display, clinicalStatus: clinical, verificationStatus: verification, onsetDate: row.onset_date }, now);
    writeAudit(db, sessionFor(db, actor), { action: "clinical.condition.amend", resourceType: "Condition", resourceId: id, outcome: "success" });
    countMetric(db, "source.condition.amended");
    const response = { id, version: next, clinicalStatus: clinical, verificationStatus: verification };
    saveCommand(db, actor.organizationId, input.idempotencyKey, hash, response);
    return { ...response, idempotent: false };
  });
}

export function listPatientEncounters(db: AppDatabase, actor: SourceActor, patientId: string) {
  gate(db, actor, "clinical.condition.read");
  assertPatient(db, actor, patientId);
  return all<{ id: string; status: string; started_at: string | null; practitioner_id: string }>(db, `SELECT id, status, started_at, practitioner_id FROM visit_encounters WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at`, actor.organizationId, actor.facilityId, patientId);
}

export function listConditions(db: AppDatabase, actor: SourceActor, patientId: string, encounterId?: string) {
  gate(db, actor, "clinical.condition.read");
  assertPatient(db, actor, patientId);
  writeAudit(db, sessionFor(db, actor), { action: "clinical.condition.read", resourceType: "Condition", resourceId: patientId, outcome: "success" });
  return all<{ id: string; encounter_id: string; display: string; clinical_status: string; verification_status: string; version: number; recorded_at: string }>(db, `SELECT id, encounter_id, display, clinical_status, verification_status, version, recorded_at FROM source_conditions WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ${encounterId ? "AND encounter_id = ?" : ""} ORDER BY recorded_at`, actor.organizationId, actor.facilityId, patientId, ...(encounterId ? [encounterId] : []));
}

export function readCondition(db: AppDatabase, actor: SourceActor, id: string) {
  gate(db, actor, "clinical.condition.read");
  const row = owned<Record<string, unknown> & { organization_id: string; facility_id: string }>(db, actor, `SELECT * FROM source_conditions WHERE id = ?`, id);
  writeAudit(db, sessionFor(db, actor), { action: "clinical.condition.read", resourceType: "Condition", resourceId: id, outcome: "success" });
  return { ...row, coding: codingForAuthorizedSource(db,actor.organizationId,"condition",id), history: history(db, actor, "condition", id) };
}

export function recordAllergy(db: AppDatabase, actor: SourceActor, input: { patientId: string; encounterId: string; practitionerId: string; code: string; verificationStatus: string; criticality?: string; idempotencyKey: string; coding?: CodingSelection }) {
  gate(db, actor, "clinical.allergy.record");
  assertKey(input.idempotencyKey);
  const hash = codingCommandHash(JSON.stringify(["allergy", input.patientId, input.encounterId, input.code, input.verificationStatus, input.criticality ?? ""]),input.coding,actor);
  const prior = readCommand<{ id: string; finding: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const concept = ALLERGIES.find((item) => item.code === input.code);
  if (!concept) throw new ValidationError("code", "That code is not on the synthetic catalog.");
  if (input.verificationStatus !== "unconfirmed" && input.verificationStatus !== "confirmed") throw new ValidationError();
  if (concept.finding !== "documented" && input.criticality) throw new ValidationError("invalid", "Criticality applies only to a documented allergy.");
  if (input.criticality && !["low", "high", "unable-to-assess"].includes(input.criticality)) throw new ValidationError();
  return transaction(db, () => {
    const again=readCommand<{ id: string; finding: string }>(db,actor.organizationId,input.idempotencyKey,hash);
    if(again)return {...again,idempotent:true};
    assertPatient(db, actor, input.patientId);
    assertPractitioner(db, actor, input.practitionerId);
    assertEncounter(db, actor, input.encounterId, input.patientId, "record");
    const now = new Date().toISOString();
    const id = `alg_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    run(
      db,
      `INSERT INTO source_allergies (id, organization_id, facility_id, patient_id, encounter_id, practitioner_id, code, code_system, code_system_version, display, category, finding, clinical_status, verification_status, criticality, recorded_at, recorded_by, version, correlation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 1, ?, ?, ?)`,
      id, actor.organizationId, actor.facilityId, input.patientId, input.encounterId, input.practitionerId, concept.code, concept.system, concept.version, concept.display, concept.category, concept.finding, input.verificationStatus, input.criticality ?? null, now, actor.userId, actor.sessionId.slice(0, 80), now, now,
    );
    remember(db, actor, "allergy", id, 1, null, input.encounterId, null, { code: concept.code, finding: concept.finding, display: concept.display, verificationStatus: input.verificationStatus, clinicalStatus: "active", criticality: input.criticality ?? null }, now);
    pinClinicalCoding(db,actor,"allergy",id,codingDefinition("allergy",concept),input.coding);
    writeAudit(db, sessionFor(db, actor), { action: "clinical.allergy.record", resourceType: "Allergy", resourceId: id, outcome: "success" });
    countMetric(db, "source.allergy.recorded");
    const response = { id, version: 1, finding: concept.finding, verificationStatus: input.verificationStatus };
    saveCommand(db, actor.organizationId, input.idempotencyKey, hash, response);
    return { ...response, idempotent: false };
  });
}

export function amendAllergy(db: AppDatabase, actor: SourceActor, id: string, input: { expectedVersion: number; clinicalStatus?: string; verificationStatus?: string; reason: string; idempotencyKey: string }) {
  gate(db, actor, "clinical.allergy.amend");
  assertKey(input.idempotencyKey);
  if (!input.reason || !/^[a-z-]{3,40}$/.test(input.reason)) throw new ValidationError();
  const hash = JSON.stringify(["amend-allergy", id, input.expectedVersion, input.clinicalStatus ?? "", input.verificationStatus ?? "", input.reason]);
  const prior = readCommand<{ id: string; version: number }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  return transaction(db, () => {
    const row = owned<{ organization_id: string; facility_id: string; patient_id: string; encounter_id: string; code: string; display: string; finding: string; clinical_status: string; verification_status: string; criticality: string | null; version: number }>(db, actor, `SELECT * FROM source_allergies WHERE id = ?`, id);
    if (row.version !== input.expectedVersion) throw new ConflictError("conflict", "The record changed. Review the current version.");
    assertEncounter(db, actor, row.encounter_id, row.patient_id, "amend");
    const clinical = input.clinicalStatus ?? row.clinical_status;
    const verification = input.verificationStatus ?? row.verification_status;
    move(row.clinical_status, clinical, ALLERGY_CLINICAL_NEXT, "allergy status");
    move(row.verification_status, verification, ALLERGY_VERIFICATION_NEXT, "verification status");
    const now = new Date().toISOString();
    const next = row.version + 1;
    const changed = run(db, `UPDATE source_allergies SET clinical_status = ?, verification_status = ?, version = ?, updated_at = ? WHERE id = ? AND version = ?`, clinical, verification, next, now, id, row.version);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    remember(db, actor, "allergy", id, next, row.version, row.encounter_id, input.reason, { code: row.code, display: row.display, finding: row.finding, clinicalStatus: clinical, verificationStatus: verification, criticality: row.criticality }, now);
    writeAudit(db, sessionFor(db, actor), { action: "clinical.allergy.amend", resourceType: "Allergy", resourceId: id, outcome: "success" });
    countMetric(db, "source.allergy.amended");
    const response = { id, version: next, clinicalStatus: clinical, verificationStatus: verification, finding: row.finding };
    saveCommand(db, actor.organizationId, input.idempotencyKey, hash, response);
    return { ...response, idempotent: false };
  });
}

export function listAllergies(db: AppDatabase, actor: SourceActor, patientId: string, encounterId?: string) {
  gate(db, actor, "clinical.allergy.read");
  assertPatient(db, actor, patientId);
  writeAudit(db, sessionFor(db, actor), { action: "clinical.allergy.read", resourceType: "Allergy", resourceId: patientId, outcome: "success" });
  return all<{ id: string; encounter_id: string; display: string; finding: string; clinical_status: string; verification_status: string; criticality: string | null; version: number; recorded_at: string }>(db, `SELECT id, encounter_id, display, finding, clinical_status, verification_status, criticality, version, recorded_at FROM source_allergies WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ${encounterId ? "AND encounter_id = ?" : ""} ORDER BY recorded_at`, actor.organizationId, actor.facilityId, patientId, ...(encounterId ? [encounterId] : []));
}

export function readAllergy(db: AppDatabase, actor: SourceActor, id: string) {
  gate(db, actor, "clinical.allergy.read");
  const row = owned<Record<string, unknown> & { organization_id: string; facility_id: string }>(db, actor, `SELECT * FROM source_allergies WHERE id = ?`, id);
  writeAudit(db, sessionFor(db, actor), { action: "clinical.allergy.read", resourceType: "Allergy", resourceId: id, outcome: "success" });
  return { ...row, coding: codingForAuthorizedSource(db,actor.organizationId,"allergy",id), history: history(db, actor, "allergy", id) };
}

function quantity(code: string, value: number) {
  const concept = QUANTITIES.find((item) => item.code === code);
  if (!concept) throw new ValidationError("code", "That code is not on the synthetic catalog.");
  if (!Number.isFinite(value)) throw new ValidationError("invalid", "That value type is not valid for this observation.");
  if (value < concept.min || value > concept.max) throw new ValidationError("range", "That value is outside the catalog range.");
  return concept;
}

export function recordObservation(db: AppDatabase, actor: SourceActor, input: { patientId: string; encounterId: string; practitionerId: string; code: string; valueQuantity?: number; components?: Array<{ code: string; value: number }>; unit?: string; status: string; effectiveAt: string; idempotencyKey: string; coding?: CodingSelection }) {
  gate(db, actor, "clinical.observation.record");
  assertKey(input.idempotencyKey);
  const hash = codingCommandHash(JSON.stringify(["observation", input.patientId, input.encounterId, input.code, input.valueQuantity ?? null, input.components ?? [], input.unit ?? "", input.status, input.effectiveAt]),input.coding,actor);
  const prior = readCommand<{ id: string; version: number }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  if (input.status !== "preliminary" && input.status !== "final") throw new ValidationError();
  if (Number.isNaN(Date.parse(input.effectiveAt))) throw new ValidationError();
  return transaction(db, () => {
    const again=readCommand<{ id: string; version: number }>(db,actor.organizationId,input.idempotencyKey,hash);
    if(again)return {...again,idempotent:true};
    assertPatient(db, actor, input.patientId);
    assertPractitioner(db, actor, input.practitionerId);
    assertEncounter(db, actor, input.encounterId, input.patientId, "record");
    const now = new Date().toISOString();
    const id = `obs_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    if (input.code === PRESSURE.code) {
      if (input.unit && input.unit !== "mm[Hg]") throw new ValidationError("invalid", "That unit is not allowed for this observation.");
      const parts = PRESSURE.components.map((part) => {
        const supplied = input.components?.find((item) => item.code === part.code);
        if (!supplied || !Number.isFinite(supplied.value)) throw new ValidationError("invalid", "Blood pressure needs both components.");
        if (supplied.value < part.min || supplied.value > part.max) throw new ValidationError("range");
        return { ...part, value: supplied.value };
      });
      run(
        db,
        `INSERT INTO source_observations (id, organization_id, facility_id, patient_id, encounter_id, practitioner_id, category, code, code_system, code_system_version, display, value_type, value_quantity, unit_code, unit_system, status, effective_at, recorded_at, recorded_by, version, correlation_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, 'vital-sign', ?, ?, ?, ?, 'component', NULL, NULL, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        id, actor.organizationId, actor.facilityId, input.patientId, input.encounterId, input.practitionerId, PRESSURE.code, PRESSURE.system, PRESSURE.version, PRESSURE.display, UNIT_SYSTEM, input.status, input.effectiveAt, now, actor.userId, actor.sessionId.slice(0, 80), now, now,
      );
      for (const part of parts) {
        run(db, `INSERT INTO source_observation_components (observation_id, code, display, value_quantity, unit_code) VALUES (?, ?, ?, ?, ?)`, id, part.code, part.display, part.value, part.unit);
      }
      remember(db, actor, "observation", id, 1, null, input.encounterId, null, { code: PRESSURE.code, display: PRESSURE.display, status: input.status, effectiveAt: input.effectiveAt, recordedAt: now, components: parts.map((part) => ({ code: part.code, value: part.value, unit: part.unit })) }, now);
    } else {
      if (input.valueQuantity === undefined) throw new ValidationError("invalid", "That value type is not valid for this observation.");
      const concept = quantity(input.code, input.valueQuantity);
      if (input.unit && input.unit !== concept.unit) throw new ValidationError("invalid", "That unit is not allowed for this observation.");
      run(
        db,
        `INSERT INTO source_observations (id, organization_id, facility_id, patient_id, encounter_id, practitioner_id, category, code, code_system, code_system_version, display, value_type, value_quantity, unit_code, unit_system, status, effective_at, recorded_at, recorded_by, version, correlation_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'quantity', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
        id, actor.organizationId, actor.facilityId, input.patientId, input.encounterId, input.practitionerId, concept.category, concept.code, concept.system, concept.version, concept.display, input.valueQuantity, concept.unit, UNIT_SYSTEM, input.status, input.effectiveAt, now, actor.userId, actor.sessionId.slice(0, 80), now, now,
      );
      remember(db, actor, "observation", id, 1, null, input.encounterId, null, { code: concept.code, display: concept.display, value: input.valueQuantity, unit: concept.unit, status: input.status, effectiveAt: input.effectiveAt, recordedAt: now }, now);
    }
    pinClinicalCoding(db,actor,"observation",id,codingDefinition("observation",input.code===PRESSURE.code?PRESSURE:QUANTITIES.find(item=>item.code===input.code)!,UNIT_SYSTEM),input.coding);
    writeAudit(db, sessionFor(db, actor), { action: "clinical.observation.record", resourceType: "Observation", resourceId: id, outcome: "success" });
    countMetric(db, "source.observation.recorded");
    const response = { id, version: 1, status: input.status };
    saveCommand(db, actor.organizationId, input.idempotencyKey, hash, response);
    return { ...response, idempotent: false };
  });
}

export function replaceObservation() {
  throw new ConflictError("conflict", "A finalized observation cannot be overwritten.");
}

export function correctObservation(db: AppDatabase, actor: SourceActor, id: string, input: { expectedVersion: number; valueQuantity?: number; components?: Array<{ code: string; value: number }>; reason: string; idempotencyKey: string }) {
  gate(db, actor, "clinical.observation.correct");
  assertKey(input.idempotencyKey);
  if (!input.reason || !/^[a-z-]{3,40}$/.test(input.reason)) throw new ValidationError("invalid", "A correction reason is required.");
  const hash = JSON.stringify(["correct", id, input.expectedVersion, input.valueQuantity ?? null, input.components ?? [], input.reason]);
  const prior = readCommand<{ id: string; version: number; value?: number }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  return transaction(db, () => {
    const row = owned<{ organization_id: string; facility_id: string; patient_id: string; encounter_id: string; code: string; display: string; value_type: string; value_quantity: number | null; unit_code: string | null; status: string; effective_at: string; version: number }>(db, actor, `SELECT * FROM source_observations WHERE id = ?`, id);
    if (row.version !== input.expectedVersion) throw new ConflictError("conflict", "The record changed. Review the current version.");
    if (!OBSERVATION_CORRECTABLE.has(row.status)) throw new ConflictError("conflict", "That observation cannot be corrected.");
    assertEncounter(db, actor, row.encounter_id, row.patient_id, "amend");
    const now = new Date().toISOString();
    const next = row.version + 1;
    let snapshot: Record<string, unknown>;
    if (row.value_type === "component") {
      const parts = PRESSURE.components.map((part) => {
        const supplied = input.components?.find((item) => item.code === part.code);
        if (!supplied || supplied.value < part.min || supplied.value > part.max) throw new ValidationError("range");
        return { code: part.code, display: part.display, value: supplied.value, unit: part.unit };
      });
      run(db, `DELETE FROM source_observation_components WHERE observation_id = ?`, id);
      for (const part of parts) run(db, `INSERT INTO source_observation_components (observation_id, code, display, value_quantity, unit_code) VALUES (?, ?, ?, ?, ?)`, id, part.code, part.display, part.value, part.unit);
      snapshot = { code: row.code, display: row.display, status: "corrected", effectiveAt: row.effective_at, components: parts };
    } else {
      if (input.valueQuantity === undefined) throw new ValidationError("invalid", "That value type is not valid for this observation.");
      const concept = quantity(row.code, input.valueQuantity);
      const changedValue = run(db, `UPDATE source_observations SET value_quantity = ? WHERE id = ? AND version = ?`, input.valueQuantity, id, row.version);
      if (changedValue.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
      snapshot = { code: concept.code, display: concept.display, value: input.valueQuantity, unit: concept.unit, status: "corrected", effectiveAt: row.effective_at };
    }
    const changed = run(db, `UPDATE source_observations SET status = 'corrected', version = ?, updated_at = ? WHERE id = ? AND version = ?`, next, now, id, row.version);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    remember(db, actor, "observation", id, next, row.version, row.encounter_id, input.reason, snapshot, now);
    writeAudit(db, sessionFor(db, actor), { action: "clinical.observation.correct", resourceType: "Observation", resourceId: id, outcome: "success" });
    countMetric(db, "source.observation.corrected");
    const response = { id, version: next, status: "corrected", value: input.valueQuantity };
    saveCommand(db, actor.organizationId, input.idempotencyKey, hash, response);
    return { ...response, idempotent: false };
  });
}

export function listObservations(db: AppDatabase, actor: SourceActor, patientId: string, encounterId?: string) {
  gate(db, actor, "clinical.observation.read");
  assertPatient(db, actor, patientId);
  writeAudit(db, sessionFor(db, actor), { action: "clinical.observation.read", resourceType: "Observation", resourceId: patientId, outcome: "success" });
  const rows = all<{ id: string; code: string; display: string; value_quantity: number | null; unit_code: string | null; status: string; effective_at: string; recorded_at: string; version: number; value_type: string }>(db, `SELECT id, code, display, value_quantity, unit_code, status, effective_at, recorded_at, version, value_type FROM source_observations WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ${encounterId ? "AND encounter_id = ?" : ""} ORDER BY recorded_at`, actor.organizationId, actor.facilityId, patientId, ...(encounterId ? [encounterId] : []));
  return rows.map((row) => ({ ...row, components: row.value_type === "component" ? all<{ code: string; display: string; value_quantity: number; unit_code: string }>(db, `SELECT code, display, value_quantity, unit_code FROM source_observation_components WHERE observation_id = ? ORDER BY code`, row.id) : [] }));
}

export function readObservation(db: AppDatabase, actor: SourceActor, id: string) {
  gate(db, actor, "clinical.observation.read");
  const row = owned<{ organization_id: string; facility_id: string; value_type: string; display: string; status: string; version: number; value_quantity: number | null; unit_code: string | null; effective_at: string; recorded_at: string; recorded_by: string }>(db, actor, `SELECT * FROM source_observations WHERE id = ?`, id);
  const components = row.value_type === "component" ? all<{ code: string; display: string; value_quantity: number; unit_code: string }>(db, `SELECT code, display, value_quantity, unit_code FROM source_observation_components WHERE observation_id = ? ORDER BY code`, id) : [];
  writeAudit(db, sessionFor(db, actor), { action: "clinical.observation.read", resourceType: "Observation", resourceId: id, outcome: "success" });
  return { ...row, coding: codingForAuthorizedSource(db,actor.organizationId,"observation",id), components, history: history(db, actor, "observation", id) };
}

export function recordMedicationDraft(db: AppDatabase, actor: SourceActor, input: { patientId: string; encounterId: string; practitionerId: string; code: string; dose: number; idempotencyKey: string; coding?: CodingSelection }) {
  gate(db, actor, "clinical.medication-order.draft");
  assertKey(input.idempotencyKey);
  const hash = codingCommandHash(JSON.stringify(["draft", input.patientId, input.encounterId, input.code, input.dose]),input.coding,actor);
  const prior = readCommand<{ id: string; version: number; status: string; executable: false; transmission: "disabled"; intent: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const concept = MEDICATIONS.find((item) => item.code === input.code);
  if (!concept) throw new ValidationError("code", "That code is not on the synthetic catalog.");
  if (!Number.isFinite(input.dose) || input.dose < concept.min || input.dose > concept.max) throw new ValidationError("range");
  return transaction(db, () => {
    const again=readCommand<{ id: string; version: number; status: string; executable: false; transmission: "disabled"; intent: string }>(db,actor.organizationId,input.idempotencyKey,hash);
    if(again)return {...again,idempotent:true};
    assertPatient(db, actor, input.patientId);
    assertPractitioner(db, actor, input.practitionerId);
    assertEncounter(db, actor, input.encounterId, input.patientId, "record");
    const now = new Date().toISOString();
    const id = `med_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    run(
      db,
      `INSERT INTO source_medication_orders (id, organization_id, facility_id, patient_id, encounter_id, practitioner_id, code, code_system, code_system_version, display, dose_quantity, dose_unit, route, frequency, intent, status, executable, transmission, recorded_at, recorded_by, version, correlation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'proposal', 'draft', 0, 'disabled', ?, ?, 1, ?, ?, ?)`,
      id, actor.organizationId, actor.facilityId, input.patientId, input.encounterId, input.practitionerId, concept.code, concept.system, concept.version, concept.display, input.dose, concept.unit, concept.route, concept.frequency, now, actor.userId, actor.sessionId.slice(0, 80), now, now,
    );
    remember(db, actor, "medication-order", id, 1, null, input.encounterId, null, { code: concept.code, display: concept.display, dose: input.dose, unit: concept.unit, route: concept.route, status: "draft", executable: false, transmission: "disabled" }, now);
    pinClinicalCoding(db,actor,"medication-order",id,codingDefinition("medication-order",concept,UNIT_SYSTEM),input.coding);
    writeAudit(db, sessionFor(db, actor), { action: "clinical.medication-order.draft", resourceType: "MedicationOrder", resourceId: id, outcome: "success" });
    countMetric(db, "source.medication.drafted");
    const response = { id, version: 1, status: "draft", executable: false as const, transmission: "disabled" as const, intent: "proposal" };
    saveCommand(db, actor.organizationId, input.idempotencyKey, hash, response);
    return { ...response, idempotent: false };
  });
}

export function amendMedicationDraft(db: AppDatabase, actor: SourceActor, id: string, input: { expectedVersion: number; dose: number; reason: string; idempotencyKey: string }) {
  gate(db, actor, "clinical.medication-order.amend");
  assertKey(input.idempotencyKey);
  if (!input.reason || !/^[a-z-]{3,40}$/.test(input.reason)) throw new ValidationError();
  const hash = JSON.stringify(["amend-med", id, input.expectedVersion, input.dose, input.reason]);
  const prior = readCommand<{ id: string; version: number }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  return transaction(db, () => {
    const row = owned<{ organization_id: string; facility_id: string; patient_id: string; encounter_id: string; code: string; display: string; dose_unit: string; route: string; status: string; version: number }>(db, actor, `SELECT * FROM source_medication_orders WHERE id = ?`, id);
    if (row.status !== "draft") throw new ConflictError("conflict", "That medication draft cannot be amended.");
    if (row.version !== input.expectedVersion) throw new ConflictError("conflict", "The record changed. Review the current version.");
    const concept = MEDICATIONS.find((item) => item.code === row.code);
    if (!concept || input.dose < concept.min || input.dose > concept.max) throw new ValidationError("range");
    assertEncounter(db, actor, row.encounter_id, row.patient_id, "amend");
    const now = new Date().toISOString();
    const next = row.version + 1;
    const changed = run(db, `UPDATE source_medication_orders SET dose_quantity = ?, version = ?, updated_at = ? WHERE id = ? AND version = ? AND status = 'draft' AND executable = 0`, input.dose, next, now, id, row.version);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    remember(db, actor, "medication-order", id, next, row.version, row.encounter_id, input.reason, { code: row.code, display: row.display, dose: input.dose, unit: row.dose_unit, route: row.route, status: "draft", executable: false, transmission: "disabled" }, now);
    writeAudit(db, sessionFor(db, actor), { action: "clinical.medication-order.amend", resourceType: "MedicationOrder", resourceId: id, outcome: "success" });
    countMetric(db, "source.medication.amended");
    const response = { id, version: next, status: "draft", executable: false as const, transmission: "disabled" as const };
    saveCommand(db, actor.organizationId, input.idempotencyKey, hash, response);
    return { ...response, idempotent: false };
  });
}

export function cancelMedicationDraft(db: AppDatabase, actor: SourceActor, id: string, input: { expectedVersion: number; reason: string; idempotencyKey: string }) {
  gate(db, actor, "clinical.medication-order.cancel");
  assertKey(input.idempotencyKey);
  if (!input.reason || !/^[a-z-]{3,40}$/.test(input.reason)) throw new ValidationError();
  const hash = JSON.stringify(["cancel-med", id, input.expectedVersion, input.reason]);
  const prior = readCommand<{ id: string; status: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  return transaction(db, () => {
    const row = owned<{ organization_id: string; facility_id: string; patient_id: string; encounter_id: string; code: string; display: string; dose_quantity: number; dose_unit: string; status: string; version: number }>(db, actor, `SELECT * FROM source_medication_orders WHERE id = ?`, id);
    if (row.status !== "draft") throw new ConflictError("conflict", "That medication draft cannot be cancelled.");
    if (row.version !== input.expectedVersion) throw new ConflictError("conflict", "The record changed. Review the current version.");
    assertEncounter(db, actor, row.encounter_id, row.patient_id, "amend");
    const now = new Date().toISOString();
    const next = row.version + 1;
    const changed = run(db, `UPDATE source_medication_orders SET status = 'cancelled', version = ?, updated_at = ? WHERE id = ? AND version = ? AND status = 'draft'`, next, now, id, row.version);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    remember(db, actor, "medication-order", id, next, row.version, row.encounter_id, input.reason, { code: row.code, display: row.display, dose: row.dose_quantity, unit: row.dose_unit, status: "cancelled", executable: false, transmission: "disabled" }, now);
    writeAudit(db, sessionFor(db, actor), { action: "clinical.medication-order.cancel", resourceType: "MedicationOrder", resourceId: id, outcome: "success" });
    countMetric(db, "source.medication.cancelled");
    const response = { id, version: next, status: "cancelled", executable: false as const, transmission: "disabled" as const };
    saveCommand(db, actor.organizationId, input.idempotencyKey, hash, response);
    return { ...response, idempotent: false };
  });
}

export function listMedicationOrders(db: AppDatabase, actor: SourceActor, patientId: string, encounterId?: string) {
  gate(db, actor, "clinical.medication-order.read");
  assertPatient(db, actor, patientId);
  writeAudit(db, sessionFor(db, actor), { action: "clinical.medication-order.read", resourceType: "MedicationOrder", resourceId: patientId, outcome: "success" });
  return all<{ id: string; display: string; dose_quantity: number; dose_unit: string; route: string; status: string; executable: number; transmission: string; intent: string; version: number; recorded_at: string }>(db, `SELECT id, display, dose_quantity, dose_unit, route, status, executable, transmission, intent, version, recorded_at FROM source_medication_orders WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ${encounterId ? "AND encounter_id = ?" : ""} ORDER BY recorded_at`, actor.organizationId, actor.facilityId, patientId, ...(encounterId ? [encounterId] : []));
}

export function readMedicationOrder(db: AppDatabase, actor: SourceActor, id: string) {
  gate(db, actor, "clinical.medication-order.read");
  const row = owned<{ organization_id: string; facility_id: string; display: string; dose_quantity: number; dose_unit: string; route: string; status: string; version: number; transmission: string; executable: number }>(db, actor, `SELECT * FROM source_medication_orders WHERE id = ?`, id);
  writeAudit(db, sessionFor(db, actor), { action: "clinical.medication-order.read", resourceType: "MedicationOrder", resourceId: id, outcome: "success" });
  return { ...row, coding: codingForAuthorizedSource(db,actor.organizationId,"medication-order",id), history: history(db, actor, "medication-order", id) };
}

export function signMedicationOrder(db: AppDatabase, actor: SourceActor, id: string) {
  requireOpen(db);
  const decision = authorize(
    db,
    { principalId: actor.userId, accountActive: true },
    "clinical.sign",
    { type: "MedicationOrder", organizationId: actor.organizationId, facilityId: actor.facilityId, sensitivity: "clinical" },
    { purpose: "TREATMENT", assurance: "directory", sessionActive: true, activeFacilityId: actor.facilityId ?? undefined, correlationId: actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) },
  );
  countMetric(db, "source.medication.sign-denied");
  if (!decision.allow) throw new ForbiddenError("forbidden", "Clinical signing is not approved.");
  throw new ForbiddenError("forbidden", "Clinical signing is not approved.");
}

export function transmitMedicationOrder(db: AppDatabase, actor: SourceActor) {
  gate(db, actor, "clinical.medication-order.read");
  countMetric(db, "source.medication.transmit-denied");
  throw new ForbiddenError("forbidden", "Medication transmission is disabled.");
}

export function sourceHistory(db: AppDatabase, actor: SourceActor, kind: string, id: string) {
  gate(db, actor, "clinical.source.history.read");
  if (!["condition", "allergy", "observation", "medication-order"].includes(kind)) throw new ValidationError();
  const table = kind === "condition" ? "source_conditions" : kind === "allergy" ? "source_allergies" : kind === "observation" ? "source_observations" : "source_medication_orders";
  owned(db, actor, `SELECT organization_id, facility_id FROM ${table} WHERE id = ?`, id);
  const rows = history(db, actor, kind, id);
  writeAudit(db, sessionFor(db, actor), { action: "clinical.source.history.read", resourceType: "ClinicalSource", resourceId: id, outcome: "success" });
  return rows;
}

export function sourceSnapshot(input: { name?: string; value?: string; traceId?: string } = {}) {
  const trace = (input.traceId ?? "none").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return { created: 0, amended: 0, conflicts: 0, unsupported: 0, trace };
}

export function setSourceDependency(db: AppDatabase, value: "available" | "unavailable") {
  run(db, `UPDATE source_controls SET value = ? WHERE name = 'dependency'`, value);
}

export function seedClinicalSource(db: AppDatabase) {
  run(db, `INSERT INTO source_controls (name, value) VALUES ('dependency', 'available') ON CONFLICT(name) DO NOTHING`);
  run(
    db,
    `INSERT OR IGNORE INTO retention_policies (
      id, organization_id, facility_id, jurisdiction, category, classification, trigger_event, duration, duration_unit,
      expiry_action, approval_state, status, version, effective_at, created_at, updated_at
    ) VALUES ('pol_syn_gh_source', 'org_demo_gh', NULL, 'SYNTHETIC_GH', 'clinical-source', 'synthetic', 'record-created', NULL, NULL, 'retain', 'pending_policy_approval', 'active', 1, '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z')`,
  );
}

export const SOURCE_ROLLBACK = `
DROP TABLE IF EXISTS source_controls;
DROP TABLE IF EXISTS source_metrics;
DROP TABLE IF EXISTS source_commands;
DROP TABLE IF EXISTS source_versions;
DROP TABLE IF EXISTS source_observation_components;
DROP TABLE IF EXISTS source_medication_orders;
DROP TABLE IF EXISTS source_observations;
DROP TABLE IF EXISTS source_allergies;
DROP TABLE IF EXISTS source_conditions;
DELETE FROM schema_migrations WHERE version IN (40, 41, 42, 43);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (39);
`;
