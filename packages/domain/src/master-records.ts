import { randomUUID } from "node:crypto";
import type { SessionContext, Sex } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { effectivePermissions } from "./authorization";
import { createPatient } from "./chart";
import type { AppDatabase } from "./db";
import { all, get, run, transaction } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { SUBJECT_AKUA } from "./consent";

type Actor = { userId: string; organizationId: string; facilityId: string | null; sessionId: string };

const SEX = new Set(["female", "male", "other", "unknown"]);

function requirePermission(db: AppDatabase, actor: Actor, permission: string) {
  if (!actor.sessionId) throw new ForbiddenError("forbidden", "Sign in is required.");
  const permissions = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId).permissions;
  if (!permissions.includes(permission)) throw new ForbiddenError();
}

function sessionFor(db: AppDatabase, actor: Actor): SessionContext {
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

function clean(value: string, label: string) {
  const text = value.trim().replace(/\s+/g, " ");
  if (text.length < 1 || text.length > 80 || /[\r\n]/.test(value)) throw new ValidationError("invalid", `${label} is not valid.`);
  return text;
}

function pair(a: string, b: string) {
  return a < b ? [a, b] : [b, a];
}

function remember(db: AppDatabase, patientId: string, organizationId: string, authorId: string, version: number, reason: string) {
  run(
    db,
    `INSERT INTO patient_versions (id, patient_id, organization_id, version, author_id, reason, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    patientId,
    organizationId,
    version,
    authorId,
    reason,
    new Date().toISOString(),
  );
}

function attachIdentity(db: AppDatabase, patientId: string, organizationId: string, facilityId: string, mrn: string, contact: string | null) {
  run(
    db,
    `INSERT OR IGNORE INTO patient_identifiers (id, patient_id, organization_id, facility_id, system, value, status) VALUES (?, ?, ?, ?, 'local-mrn', ?, 'active')`,
    `${patientId}:mrn`,
    patientId,
    organizationId,
    facilityId,
    mrn,
  );
  run(
    db,
    `INSERT OR IGNORE INTO patient_facility_registrations (id, patient_id, organization_id, facility_id, status, version) VALUES (?, ?, ?, ?, 'active', 1)`,
    `${patientId}:fac`,
    patientId,
    organizationId,
    facilityId,
  );
  if (contact) {
    run(
      db,
      `INSERT OR IGNORE INTO patient_contacts (id, patient_id, organization_id, use, system, value) VALUES (?, ?, ?, 'home', 'phone', ?)`,
      `${patientId}:phone`,
      patientId,
      organizationId,
      contact,
    );
  }
}

export function findDuplicateMatches(db: AppDatabase, organizationId: string, input: { givenName: string; familyName: string; birthDate: string; contact?: string | null; identifier?: { system: string; value: string } }, exceptId?: string) {
  const given = input.givenName.trim().toLowerCase();
  const family = input.familyName.trim().toLowerCase();
  const rows = all<{ id: string; reason: string }>(
    db,
    `SELECT id, 'name-birth' AS reason FROM patients
     WHERE organization_id = ? AND lower(given_name) = ? AND lower(family_name) = ? AND birth_date = ?
       AND registration_status != 'merged' AND id != coalesce(?, '')`,
    organizationId,
    given,
    family,
    input.birthDate,
    exceptId ?? "",
  );
  if (input.contact) {
    const contacts = all<{ patient_id: string }>(
      db,
      `SELECT patient_id FROM patient_contacts WHERE organization_id = ? AND value = ? AND patient_id != coalesce(?, '')`,
      organizationId,
      input.contact,
      exceptId ?? "",
    );
    for (const contact of contacts) rows.push({ id: contact.patient_id, reason: "contact" });
  }
  if (input.identifier) {
    const identifiers = all<{ patient_id: string }>(
      db,
      `SELECT patient_id FROM patient_identifiers WHERE organization_id = ? AND system = ? AND value = ? AND patient_id != coalesce(?, '')`,
      organizationId,
      input.identifier.system,
      input.identifier.value,
      exceptId ?? "",
    );
    for (const identifier of identifiers) rows.push({ id: identifier.patient_id, reason: "identifier" });
  }
  return rows;
}

export function openRegistrationDraft(db: AppDatabase, actor: Actor, input: { givenName: string; familyName: string; preferredName?: string; birthDate: string; sex: string; contact?: string; idempotencyKey: string }) {
  requirePermission(db, actor, "patient.register");
  if (!actor.facilityId) throw new ForbiddenError();
  const givenName = clean(input.givenName, "Given name");
  const familyName = clean(input.familyName, "Family name");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.birthDate)) throw new ValidationError("invalid", "Birth date is not valid.");
  if (!SEX.has(input.sex)) throw new ValidationError("invalid", "Sex is not valid.");
  const contact = input.contact?.trim() ? clean(input.contact, "Contact") : null;
  const matches = findDuplicateMatches(db, actor.organizationId, { givenName, familyName, birthDate: input.birthDate, contact });
  const id = `draft_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  run(
    db,
    `INSERT INTO patient_registration_drafts (id, organization_id, facility_id, actor_id, given_name, family_name, preferred_name, birth_date, sex, contact_value, idempotency_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    id,
    actor.organizationId,
    actor.facilityId,
    actor.userId,
    givenName,
    familyName,
    input.preferredName ? clean(input.preferredName, "Preferred name") : null,
    input.birthDate,
    input.sex,
    contact,
    input.idempotencyKey,
    new Date().toISOString(),
  );
  return { draftId: id, matches: matches.map((match) => ({ patientId: match.id, reason: match.reason })) };
}

export function readRegistrationDraft(db: AppDatabase, actor: Actor, draftId: string) {
  requirePermission(db, actor, "patient.register");
  const draft = get<{ id: string; organization_id: string; facility_id: string; actor_id: string; given_name: string; family_name: string; preferred_name: string | null; birth_date: string; sex: string; contact_value: string | null }>(
    db,
    `SELECT id, organization_id, facility_id, actor_id, given_name, family_name, preferred_name, birth_date, sex, contact_value FROM patient_registration_drafts WHERE id = ?`,
    draftId,
  );
  if (!draft || draft.organization_id !== actor.organizationId || draft.actor_id !== actor.userId || draft.facility_id !== actor.facilityId) {
    throw new NotFoundError("That registration draft is not available.");
  }
  const matches = findDuplicateMatches(db, actor.organizationId, {
    givenName: draft.given_name,
    familyName: draft.family_name,
    birthDate: draft.birth_date,
    contact: draft.contact_value,
  });
  return { ...draft, matches };
}

export function commitRegistration(db: AppDatabase, actor: Actor, draftId: string) {
  requirePermission(db, actor, "patient.register");
  const draft = get<{ given_name: string; family_name: string; preferred_name: string | null; birth_date: string; sex: string; contact_value: string | null; idempotency_key: string; facility_id: string; organization_id: string }>(
    db,
    `SELECT * FROM patient_registration_drafts WHERE id = ? AND organization_id = ? AND actor_id = ?`,
    draftId,
    actor.organizationId,
    actor.userId,
  );
  if (!draft || draft.facility_id !== actor.facilityId) throw new NotFoundError("That registration draft is not available.");
  const prior = get<{ response_json: string }>(db, `SELECT response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`, actor.organizationId, draft.idempotency_key);
  if (prior) {
    const parsed = JSON.parse(prior.response_json) as { id: string; mrn: string };
    run(db, `DELETE FROM patient_registration_drafts WHERE id = ?`, draftId);
    return { id: parsed.id, mrn: parsed.mrn, candidateCount: 0, idempotent: true };
  }
  const ctx = sessionFor(db, actor);
  const created = createPatient(db, ctx, {
    givenName: draft.given_name,
    familyName: draft.family_name,
    birthDate: draft.birth_date,
    sex: draft.sex as Sex,
    idempotencyKey: draft.idempotency_key,
  });
  if (draft.preferred_name) run(db, `UPDATE patients SET preferred_name = ?, registration_source = 'chart' WHERE id = ?`, draft.preferred_name, created.id);
  attachIdentity(db, created.id, actor.organizationId, draft.facility_id, created.mrn, draft.contact_value);
  remember(db, created.id, actor.organizationId, actor.userId, 1, "registered");
  const matches = findDuplicateMatches(db, actor.organizationId, { givenName: draft.given_name, familyName: draft.family_name, birthDate: draft.birth_date, contact: draft.contact_value }, created.id);
  for (const match of matches) {
    const [left, right] = pair(created.id, match.id);
    run(
      db,
      `INSERT OR IGNORE INTO duplicate_candidates (id, organization_id, left_patient_id, right_patient_id, reason, status, version, opened_by)
       VALUES (?, ?, ?, ?, ?, 'open', 1, ?)`,
      `dup_${left}_${right}_${match.reason}`.slice(0, 80),
      actor.organizationId,
      left,
      right,
      match.reason,
      actor.userId,
    );
  }
  run(db, `DELETE FROM patient_registration_drafts WHERE id = ?`, draftId);
  return { id: created.id, mrn: created.mrn, candidateCount: matches.length, idempotent: false };
}

export function listMasterPatients(db: AppDatabase, actor: Actor, query = "") {
  requirePermission(db, actor, "patient.read");
  if (!actor.facilityId) throw new ForbiddenError();
  const needle = query.trim().toLowerCase().replace(/[%_]/g, "");
  return all<{ id: string; mrn: string; given_name: string; family_name: string; birth_date: string; sex: string; registration_status: string; open_candidates: number }>(
    db,
    `SELECT p.id, p.mrn, p.given_name, p.family_name, p.birth_date, p.sex, p.registration_status,
            (SELECT COUNT(*) FROM duplicate_candidates d WHERE d.organization_id = p.organization_id AND d.status = 'open' AND (d.left_patient_id = p.id OR d.right_patient_id = p.id)) AS open_candidates
     FROM patients p
     WHERE p.organization_id = ?
       AND (p.facility_id = ? OR EXISTS (
         SELECT 1 FROM patient_facility_registrations r
         WHERE r.patient_id = p.id AND r.facility_id = ? AND r.status = 'active'
       ))
       AND (? = '' OR lower(p.given_name) LIKE ? OR lower(p.family_name) LIKE ? OR lower(p.mrn) LIKE ?)
     ORDER BY p.family_name, p.given_name LIMIT 50`,
    actor.organizationId,
    actor.facilityId,
    actor.facilityId,
    needle,
    `%${needle}%`,
    `%${needle}%`,
    `%${needle}%`,
  );
}

export function readMasterPatient(db: AppDatabase, actor: Actor, patientId: string) {
  requirePermission(db, actor, "patient.read");
  const row = get<{ id: string; organization_id: string; facility_id: string; mrn: string; given_name: string; family_name: string; preferred_name: string | null; birth_date: string; sex: string; registration_status: string; registration_source: string; version: number; merged_into_id: string | null }>(
    db,
    `SELECT * FROM patients WHERE id = ?`,
    patientId,
  );
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That patient is not available.");
  if (actor.facilityId && row.facility_id !== actor.facilityId && row.registration_status !== "merged") {
    const registration = get(db, `SELECT id FROM patient_facility_registrations WHERE patient_id = ? AND facility_id = ?`, patientId, actor.facilityId);
    if (!registration) throw new NotFoundError("That patient is not available.");
  }
  const identifiers = all<{ system: string; value: string; status: string }>(db, `SELECT system, value, status FROM patient_identifiers WHERE patient_id = ?`, patientId);
  const contacts = all<{ use: string; system: string; value: string }>(db, `SELECT use, system, value FROM patient_contacts WHERE patient_id = ?`, patientId);
  const history = all<{ version: number; author_id: string; reason: string; created_at: string }>(db, `SELECT version, author_id, reason, created_at FROM patient_versions WHERE patient_id = ? ORDER BY version`, patientId);
  const registrations = all<{ facility_id: string; status: string }>(db, `SELECT facility_id, status FROM patient_facility_registrations WHERE patient_id = ?`, patientId);
  const subjects = all<{ subject_kind: string; status: string }>(db, `SELECT subject_kind, status FROM patient_subject_links WHERE patient_id = ?`, patientId);
  writeAudit(db, sessionFor(db, { ...actor, facilityId: actor.facilityId ?? row.facility_id }), { action: "patient.read", resourceType: "Patient", resourceId: patientId, outcome: "success" });
  return { ...row, identifiers, contacts, history, registrations, subjects };
}

export function updatePatientDemographics(db: AppDatabase, actor: Actor, patientId: string, expectedVersion: number, patch: { preferredName?: string }) {
  requirePermission(db, actor, "patient.update");
  const row = get<{ version: number; organization_id: string; registration_status: string }>(db, `SELECT version, organization_id, registration_status FROM patients WHERE id = ?`, patientId);
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That patient is not available.");
  if (row.registration_status === "merged") throw new ConflictError("conflict", "That patient is already superseded.");
  if (row.version !== expectedVersion) throw new ConflictError("conflict", "The patient record changed.");
  const preferred = patch.preferredName ? clean(patch.preferredName, "Preferred name") : null;
  const changed = run(db, `UPDATE patients SET preferred_name = ?, version = version + 1 WHERE id = ? AND version = ?`, preferred, patientId, expectedVersion);
  if (changed.changes !== 1) throw new ConflictError("conflict", "The patient record changed.");
  remember(db, patientId, actor.organizationId, actor.userId, expectedVersion + 1, "demographics");
  writeAudit(db, sessionFor(db, actor), { action: "patient.update", resourceType: "Patient", resourceId: patientId, outcome: "success" });
  return { id: patientId, version: expectedVersion + 1 };
}

export function registerPatientFacility(db: AppDatabase, actor: Actor, patientId: string, facilityId: string) {
  requirePermission(db, actor, "patient.update");
  const patient = get<{ organization_id: string; registration_status: string }>(db, `SELECT organization_id, registration_status FROM patients WHERE id = ?`, patientId);
  if (!patient || patient.organization_id !== actor.organizationId) throw new NotFoundError("That patient is not available.");
  if (patient.registration_status === "merged") throw new ConflictError("conflict", "That patient is already superseded.");
  const facility = get(db, `SELECT id FROM facilities WHERE id = ? AND organization_id = ?`, facilityId, actor.organizationId);
  if (!facility) throw new ValidationError("invalid", "That facility is not in this organization.");
  run(
    db,
    `INSERT OR IGNORE INTO patient_facility_registrations (id, patient_id, organization_id, facility_id, status, version) VALUES (?, ?, ?, ?, 'active', 1)`,
    `${patientId}:${facilityId}`,
    patientId,
    actor.organizationId,
    facilityId,
  );
  writeAudit(db, sessionFor(db, actor), { action: "patient.register", resourceType: "Patient", resourceId: patientId, outcome: "success" });
  return { patientId, facilityId, status: "active" };
}

export function listDuplicateCandidates(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "patient.read");
  return all<{ id: string; left_patient_id: string; right_patient_id: string; reason: string; status: string; version: number }>(
    db,
    `SELECT id, left_patient_id, right_patient_id, reason, status, version FROM duplicate_candidates WHERE organization_id = ? ORDER BY id`,
    actor.organizationId,
  );
}

export function readDuplicateCandidate(db: AppDatabase, actor: Actor, id: string) {
  requirePermission(db, actor, "patient.read");
  const row = get<{ id: string; organization_id: string; left_patient_id: string; right_patient_id: string; reason: string; status: string; version: number; opened_by: string }>(
    db,
    `SELECT * FROM duplicate_candidates WHERE id = ?`,
    id,
  );
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That duplicate candidate is not available.");
  const load = (patientId: string) => get<{ id: string; given_name: string; family_name: string; birth_date: string; mrn: string; version: number; registration_status: string }>(db, `SELECT id, given_name, family_name, birth_date, mrn, version, registration_status FROM patients WHERE id = ? AND organization_id = ?`, patientId, actor.organizationId);
  return { ...row, left: load(row.left_patient_id), right: load(row.right_patient_id) };
}

export function decideDuplicate(db: AppDatabase, actor: Actor, id: string, expectedVersion: number, decision: "different" | "needs-information" | "merge", survivorId?: string, commandKey?: string) {
  if (decision === "merge") return mergePatients(db, actor, id, expectedVersion, survivorId ?? "", commandKey ?? id);
  requirePermission(db, actor, "patient.read");
  const row = get<{ version: number; organization_id: string; status: string }>(db, `SELECT version, organization_id, status FROM duplicate_candidates WHERE id = ?`, id);
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That duplicate candidate is not available.");
  if (row.version !== expectedVersion) throw new ConflictError("conflict", "The duplicate candidate changed.");
  const status = decision === "different" ? "rejected" : "needs-information";
  const changed = run(db, `UPDATE duplicate_candidates SET status = ?, version = version + 1, decided_by = ? WHERE id = ? AND version = ?`, status, actor.userId, id, expectedVersion);
  if (changed.changes !== 1) throw new ConflictError("conflict", "The duplicate candidate changed.");
  writeAudit(db, sessionFor(db, actor), { action: "patient.duplicate.review", resourceType: "DuplicateCandidate", resourceId: id, outcome: "success" });
  return { id, status, version: expectedVersion + 1 };
}

export function mergePatients(db: AppDatabase, actor: Actor, candidateId: string, expectedVersion: number, survivorId: string, commandKey: string) {
  requirePermission(db, actor, "patient.merge");
  const cached = get<{ response_json: string }>(db, `SELECT response_json FROM master_commands WHERE organization_id = ? AND command_key = ?`, actor.organizationId, commandKey);
  if (cached) return JSON.parse(cached.response_json) as { id: string; survivorId: string; retiredId: string; status: string; blockedResources: string[] };
  const candidate = get<{ organization_id: string; left_patient_id: string; right_patient_id: string; version: number; status: string; opened_by: string }>(db, `SELECT * FROM duplicate_candidates WHERE id = ?`, candidateId);
  if (!candidate || candidate.organization_id !== actor.organizationId) throw new NotFoundError("That duplicate candidate is not available.");
  if (candidate.opened_by === actor.userId) throw new ForbiddenError("forbidden", "The person who opened the candidate cannot confirm the merge.");
  if (candidate.version !== expectedVersion) throw new ConflictError("conflict", "The duplicate candidate changed.");
  if (![candidate.left_patient_id, candidate.right_patient_id].includes(survivorId)) throw new ValidationError("invalid", "The surviving record must be one of the two candidates.");
  const retiredId = survivorId === candidate.left_patient_id ? candidate.right_patient_id : candidate.left_patient_id;
  if (survivorId === retiredId) throw new ValidationError("invalid", "A record cannot merge into itself.");
  return transaction(db, () => {
    const survivor = get<{ version: number; registration_status: string; merged_into_id: string | null }>(db, `SELECT version, registration_status, merged_into_id FROM patients WHERE id = ? AND organization_id = ?`, survivorId, actor.organizationId);
    const retired = get<{ version: number; registration_status: string; merged_into_id: string | null }>(db, `SELECT version, registration_status, merged_into_id FROM patients WHERE id = ? AND organization_id = ?`, retiredId, actor.organizationId);
    if (!survivor || !retired) throw new NotFoundError("That patient is not available.");
    if (survivor.registration_status === "merged" || retired.registration_status === "merged" || survivor.merged_into_id || retired.merged_into_id) {
      throw new ConflictError("conflict", "That patient is already superseded.");
    }
    const blocked = ["conditions", "allergies", "medications", "encounters", "observations"].filter((table) => {
      const count = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM ${table} WHERE patient_id = ?`, retiredId);
      return Number(count?.c ?? 0) > 0;
    });
    const changed = run(db, `UPDATE patients SET registration_status = 'merged', merged_into_id = ?, version = version + 1 WHERE id = ? AND version = ? AND registration_status != 'merged'`, survivorId, retiredId, retired.version);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The patient record changed.");
    const reviewed = run(db, `UPDATE duplicate_candidates SET status = 'merged', version = version + 1, decided_by = ? WHERE id = ? AND version = ?`, actor.userId, candidateId, expectedVersion);
    if (reviewed.changes !== 1) throw new ConflictError("conflict", "The duplicate candidate changed.");
    const mergeId = `mrg_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    run(
      db,
      `INSERT INTO patient_merges (id, organization_id, survivor_id, retired_id, actor_id, survivor_version, retired_version, blocked_resources, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      mergeId,
      actor.organizationId,
      survivorId,
      retiredId,
      actor.userId,
      survivor.version,
      retired.version,
      blocked.join(","),
      new Date().toISOString(),
    );
    remember(db, retiredId, actor.organizationId, actor.userId, retired.version + 1, "merged");
    writeAudit(db, sessionFor(db, actor), { action: "patient.merge", resourceType: "Patient", resourceId: survivorId, outcome: "success" });
    const response = { id: mergeId, survivorId, retiredId, status: "merged", blockedResources: blocked };
    run(db, `INSERT INTO master_commands (organization_id, command_key, response_json) VALUES (?, ?, ?)`, actor.organizationId, commandKey, JSON.stringify(response));
    return response;
  });
}

export function readPractitioner(db: AppDatabase, actor: Actor, practitionerId: string) {
  requirePermission(db, actor, "practitioner.read");
  const row = get<{ id: string; organization_id: string; display_name: string; role_type: string; license_number: string | null; license_issuer: string | null; verification_state: string; status: string; version: number }>(
    db,
    `SELECT * FROM practitioners WHERE id = ?`,
    practitionerId,
  );
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That practitioner is not available.");
  const affiliations = all<{ facility_id: string; status: string }>(db, `SELECT facility_id, status FROM practitioner_affiliations WHERE practitioner_id = ?`, practitionerId);
  const link = get<{ user_id: string; status: string }>(db, `SELECT user_id, status FROM practitioner_identity_links WHERE practitioner_id = ?`, practitionerId);
  return { ...row, affiliations, link: link ?? null };
}

export function updatePractitioner(db: AppDatabase, actor: Actor, practitionerId: string, expectedVersion: number, patch: { verificationState?: string; status?: string }) {
  requirePermission(db, actor, "practitioner.manage");
  if (patch.verificationState === "verified") throw new ValidationError("invalid", "Synthetic licensing is not a real credential check.");
  const row = get<{ version: number; organization_id: string }>(db, `SELECT version, organization_id FROM practitioners WHERE id = ?`, practitionerId);
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That practitioner is not available.");
  if (row.version !== expectedVersion) throw new ConflictError("conflict", "The practitioner record changed.");
  const status = patch.status === "inactive" ? "inactive" : "active";
  const changed = run(db, `UPDATE practitioners SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, status, new Date().toISOString(), practitionerId, expectedVersion);
  if (changed.changes !== 1) throw new ConflictError("conflict", "The practitioner record changed.");
  writeAudit(db, sessionFor(db, actor), { action: "practitioner.update", resourceType: "Practitioner", resourceId: practitionerId, outcome: "success" });
  return { id: practitionerId, version: expectedVersion + 1, verificationState: "fictional-unverified" };
}

export function affiliatePractitioner(db: AppDatabase, actor: Actor, practitionerId: string, facilityId: string) {
  requirePermission(db, actor, "practitioner.manage");
  const practitioner = get(db, `SELECT id FROM practitioners WHERE id = ? AND organization_id = ?`, practitionerId, actor.organizationId);
  if (!practitioner) throw new NotFoundError("That practitioner is not available.");
  const facility = get(db, `SELECT id FROM facilities WHERE id = ? AND organization_id = ?`, facilityId, actor.organizationId);
  if (!facility) throw new ValidationError("invalid", "That facility is not in this organization.");
  run(
    db,
    `INSERT OR IGNORE INTO practitioner_affiliations (id, practitioner_id, organization_id, facility_id, status) VALUES (?, ?, ?, ?, 'active')`,
    `${practitionerId}:${facilityId}`,
    practitionerId,
    actor.organizationId,
    facilityId,
  );
  return { practitionerId, facilityId, status: "active" };
}

export function unlinkPractitioner(db: AppDatabase, actor: Actor, practitionerId: string) {
  requirePermission(db, actor, "practitioner.link");
  const link = get<{ organization_id: string }>(db, `SELECT organization_id FROM practitioner_identity_links WHERE practitioner_id = ?`, practitionerId);
  if (!link || link.organization_id !== actor.organizationId) throw new NotFoundError("That practitioner link is not available.");
  run(db, `UPDATE practitioner_identity_links SET status = 'inactive', version = version + 1 WHERE practitioner_id = ?`, practitionerId);
  writeAudit(db, sessionFor(db, actor), { action: "practitioner.unlink", resourceType: "Practitioner", resourceId: practitionerId, outcome: "success" });
  return { practitionerId, status: "inactive" };
}

export function listPractitioners(db: AppDatabase, actor: Actor) {
  requirePermission(db, actor, "practitioner.read");
  return all<{ id: string; display_name: string; role_type: string; status: string; verification_state: string; linked_user: string | null }>(
    db,
    `SELECT p.id, p.display_name, p.role_type, p.status, p.verification_state, l.user_id AS linked_user
     FROM practitioners p LEFT JOIN practitioner_identity_links l ON l.practitioner_id = p.id AND l.status = 'active'
     WHERE p.organization_id = ? ORDER BY p.display_name`,
    actor.organizationId,
  );
}

export function createPractitioner(db: AppDatabase, actor: Actor, input: { displayName: string; roleType: string; licenseNumber?: string; licenseIssuer?: string; facilityId: string }) {
  requirePermission(db, actor, "practitioner.manage");
  const facility = get(db, `SELECT id FROM facilities WHERE id = ? AND organization_id = ?`, input.facilityId, actor.organizationId);
  if (!facility) throw new ValidationError("invalid", "That facility is not in this organization.");
  const id = `pr_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
  const now = new Date().toISOString();
  run(
    db,
    `INSERT INTO practitioners (id, organization_id, display_name, role_type, license_number, license_issuer, verification_state, status, version, author_id, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'fictional-unverified', 'active', 1, ?, ?, ?)`,
    id,
    actor.organizationId,
    clean(input.displayName, "Display name"),
    clean(input.roleType, "Role"),
    input.licenseNumber ? clean(input.licenseNumber, "License") : null,
    input.licenseIssuer ? clean(input.licenseIssuer, "Issuer") : null,
    actor.userId,
    now,
    now,
  );
  run(
    db,
    `INSERT INTO practitioner_affiliations (id, practitioner_id, organization_id, facility_id, status) VALUES (?, ?, ?, ?, 'active')`,
    `${id}:fac`,
    id,
    actor.organizationId,
    input.facilityId,
  );
  writeAudit(db, sessionFor(db, actor), { action: "practitioner.create", resourceType: "Practitioner", resourceId: id, outcome: "success" });
  return { id, verificationState: "fictional-unverified" };
}

export function linkPractitioner(db: AppDatabase, actor: Actor, practitionerId: string, userId: string) {
  requirePermission(db, actor, "practitioner.link");
  const practitioner = get<{ organization_id: string; status: string }>(db, `SELECT organization_id, status FROM practitioners WHERE id = ?`, practitionerId);
  if (!practitioner || practitioner.organization_id !== actor.organizationId) throw new NotFoundError("That practitioner is not available.");
  if (practitioner.status !== "active") throw new ConflictError("conflict", "An inactive practitioner cannot be linked.");
  const membership = get<{ status: string }>(db, `SELECT status FROM organization_memberships WHERE organization_id = ? AND user_id = ?`, actor.organizationId, userId);
  if (!membership || membership.status !== "active") throw new ForbiddenError("forbidden", "That workforce identity is not an active member of this organization.");
  const external = get<{ issuer: string; subject: string }>(db, `SELECT issuer, subject FROM external_identities WHERE user_id = ? AND status = 'active'`, userId);
  if (!external?.issuer || !external.subject) throw new ForbiddenError("forbidden", "That workforce identity is not verified by an issuer and subject.");
  run(
    db,
    `INSERT INTO practitioner_identity_links (id, practitioner_id, organization_id, user_id, status, version) VALUES (?, ?, ?, ?, 'active', 1)`,
    `${practitionerId}:user`,
    practitionerId,
    actor.organizationId,
    userId,
  );
  writeAudit(db, sessionFor(db, actor), { action: "practitioner.link", resourceType: "Practitioner", resourceId: practitionerId, outcome: "success" });
  return { practitionerId, userId, status: "active" };
}

export function linkVerifiedSubject(db: AppDatabase, actor: Actor, patientId: string, subjectId: string, subjectKind: "consent" | "privacy") {
  requirePermission(db, actor, "patient.update");
  const patient = get(db, `SELECT id FROM patients WHERE id = ? AND organization_id = ?`, patientId, actor.organizationId);
  if (!patient) throw new NotFoundError("That patient is not available.");
  const table = subjectKind === "consent" ? "consent_subjects" : "privacy_subjects";
  const subject = get(db, `SELECT id FROM ${table} WHERE id = ? AND organization_id = ?`, subjectId, actor.organizationId);
  if (!subject) throw new NotFoundError("That subject is not available.");
  run(
    db,
    `INSERT INTO patient_subject_links (id, patient_id, organization_id, subject_id, subject_kind, status) VALUES (?, ?, ?, ?, ?, 'verified')`,
    `${patientId}:${subjectKind}:${subjectId}`,
    patientId,
    actor.organizationId,
    subjectId,
    subjectKind,
  );
  return { patientId, subjectId, status: "verified" };
}

export function refusePatientDisposal() {
  throw new ForbiddenError("forbidden", "Clinical master records are not disposable while retention policy is unapproved.");
}

export function seedMasterRecords(db: AppDatabase) {
  if (!get(db, `SELECT id FROM organizations WHERE id = 'org_demo_gh'`)) return;
  const rows = [
    ["pat_gh_kofi_a", "org_demo_gh", "fac_gh_accra", "ACC-4401", "Kofi", "Mensah", "1990-04-04", "male", "usr_gh_doctor"],
    ["pat_gh_kofi_b", "org_demo_gh", "fac_gh_accra", "ACC-4402", "Kofi", "Mensah", "1990-04-04", "male", "usr_gh_doctor"],
    ["pat_gh_ama_serwaa", "org_demo_gh", "fac_gh_accra", "ACC-4403", "Ama", "Serwaa", "1990-04-04", "female", "usr_gh_doctor"],
    ["pat_eu_kofi", "org_demo_eu", "fac_eu_northbridge", "ACC-4401", "Kofi", "Mensah", "1990-04-04", "male", "usr_eu_doctor"],
  ] as const;
  for (const [id, org, facility, mrn, given, family, birth, sex, author] of rows) {
    run(
      db,
      `INSERT OR IGNORE INTO patients (id, organization_id, facility_id, mrn, given_name, family_name, birth_date, sex, confidentiality, retention_class, version, author_id, recorded_at, registration_status, registration_source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'normal', 'clinical-standard', 1, ?, '2026-01-15T00:00:00.000Z', 'active', 'synthetic-fixture')`,
      id,
      org,
      facility,
      mrn,
      given,
      family,
      birth,
      sex,
      author,
    );
    attachIdentity(db, id, org, facility, mrn, id === "pat_gh_kofi_a" || id === "pat_gh_ama_serwaa" ? "0200004400" : null);
  }
  run(
    db,
    `INSERT OR IGNORE INTO duplicate_candidates (id, organization_id, left_patient_id, right_patient_id, reason, status, version, opened_by)
     VALUES ('dup_pat_gh_kofi', 'org_demo_gh', 'pat_gh_kofi_a', 'pat_gh_kofi_b', 'name-birth', 'open', 1, 'seed')`,
  );
  run(
    db,
    `INSERT OR IGNORE INTO retention_policies (
      id, organization_id, facility_id, jurisdiction, category, classification, trigger_event, duration, duration_unit,
      expiry_action, approval_state, status, version, effective_at, created_at, updated_at
    ) VALUES ('pol_syn_gh_master', 'org_demo_gh', NULL, 'SYNTHETIC_GH', 'clinical-master', 'synthetic', 'record-created', NULL, NULL, 'retain', 'pending_policy_approval', 'active', 1, '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z')`,
  );
  const now = new Date().toISOString();
  run(
    db,
    `INSERT OR IGNORE INTO practitioners (id, organization_id, display_name, role_type, license_number, license_issuer, verification_state, status, version, author_id, created_at, updated_at)
     VALUES ('pr_gh_kwame', 'org_demo_gh', 'Kwame Boateng', 'doctor', 'SYN-LIC-4401', 'SYNTHETIC-GH', 'fictional-unverified', 'active', 1, 'usr_gh_admin', ?, ?)`,
    now,
    now,
  );
  run(
    db,
    `INSERT OR IGNORE INTO practitioner_affiliations (id, practitioner_id, organization_id, facility_id, status)
     VALUES ('pr_gh_kwame:fac', 'pr_gh_kwame', 'org_demo_gh', 'fac_gh_accra', 'active')`,
  );
  run(
    db,
    `INSERT OR IGNORE INTO practitioners (id, organization_id, display_name, role_type, license_number, license_issuer, verification_state, status, version, author_id, created_at, updated_at)
     VALUES ('pr_gh_visitor', 'org_demo_gh', 'Abena Visitor', 'doctor', 'SYN-LIC-4402', 'SYNTHETIC-GH', 'fictional-unverified', 'inactive', 1, 'usr_gh_admin', ?, ?)`,
    now,
    now,
  );
  run(
    db,
    `UPDATE organization_memberships SET status = 'revoked' WHERE organization_id = 'org_demo_gh' AND user_id = 'usr_gh_invite' AND status != 'revoked'`,
  );
  run(
    db,
    `INSERT OR IGNORE INTO external_identities (id, issuer, subject, user_id, email, status)
     VALUES ('ext_usr_gh_doctor', 'http://127.0.0.1:15556/dex', 'subject-kwame-boateng', 'usr_gh_doctor', 'kwame.boateng@demo-gh.invalid', 'active')`,
  );
  if (!get(db, `SELECT id FROM patient_subject_links WHERE subject_id = ?`, SUBJECT_AKUA)) return;
}

export const MASTER_ROLLBACK = `
DROP TABLE IF EXISTS master_commands;
DROP TABLE IF EXISTS patient_registration_drafts;
DROP TABLE IF EXISTS patient_subject_links;
DROP TABLE IF EXISTS practitioner_identity_links;
DROP TABLE IF EXISTS practitioner_affiliations;
DROP TABLE IF EXISTS practitioners;
DROP TABLE IF EXISTS patient_merges;
DROP TABLE IF EXISTS duplicate_candidates;
DROP TABLE IF EXISTS patient_versions;
DROP TABLE IF EXISTS patient_facility_registrations;
DROP TABLE IF EXISTS patient_contacts;
DROP TABLE IF EXISTS patient_identifiers;
DELETE FROM schema_migrations WHERE version IN (38, 39, 40, 41, 42, 43);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (37);
`;
