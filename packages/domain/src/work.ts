import { codingCommandHash, codingForAuthorizedSource, pinClinicalCoding, workCodingDefinition, type CodingSelection } from "./clinical-coding";
import { randomUUID } from "node:crypto";
import { catalogForOrder, type OrderCatalogSnapshot } from "./facility-catalogs";
import { writeAudit } from "./audit";
import { authorize, effectivePermissions } from "./authorization";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import type { SessionContext } from "@curasphere/contracts";

export type WorkActor = { userId: string; organizationId: string; facilityId: string | null; sessionId: string };

const ORDER_SYSTEM = { system: "curasphere.synthetic.order", version: "2026.10" };
const PLAN_SYSTEM = { system: "curasphere.synthetic.care-plan", version: "2026.10" };
const REFERRAL_SYSTEM = { system: "curasphere.synthetic.referral", version: "2026.10" };
const ATTACHMENT_SYSTEM = { system: "curasphere.synthetic.attachment", version: "2026.10" };

const DEPARTMENTS = [
  { id: "dep_gh_accra_nursing", organizationId: "org_demo_gh", facilityId: "fac_gh_accra", kind: "nursing", display: "Accra nursing" },
  { id: "dep_gh_madina_lab", organizationId: "org_demo_gh", facilityId: "fac_gh_madina", kind: "laboratory", display: "Madina laboratory" },
  { id: "dep_gh_madina_imaging", organizationId: "org_demo_gh", facilityId: "fac_gh_madina", kind: "imaging", display: "Madina imaging" },
  { id: "dep_gh_east_clinic", organizationId: "org_demo_gh", facilityId: "fac_gh_east_legon", kind: "nursing", display: "East Legon clinic" },
];
const ORDERS = [
  { ...ORDER_SYSTEM, code: "syn-cbc", display: "Full blood count request", category: "laboratory" },
  { ...ORDER_SYSTEM, code: "syn-cxr", display: "Chest imaging request", category: "imaging" },
  { ...ORDER_SYSTEM, code: "syn-nursing-review", display: "Nursing review request", category: "nursing" },
];
const PLANS = [{ ...PLAN_SYSTEM, code: "syn-follow-up-plan", display: "Follow-up plan" }];
const REFERRALS = [{ ...REFERRAL_SYSTEM, code: "syn-diagnostic-review", display: "Diagnostic review" }];
const ATTACHMENTS = [{ ...ATTACHMENT_SYSTEM, code: "syn-request-note", display: "Synthetic request note", mediaType: "application/pdf" }];
const ORDER_NEXT: Record<string, string[]> = { submitted: ["routed", "cancelled"], routed: ["cancelled"], cancelled: [] };
const PLAN_NEXT: Record<string, string[]> = { active: ["completed", "cancelled"], completed: [], cancelled: [] };
const REFERRAL_NEXT: Record<string, string[]> = { submitted: ["accepted", "declined", "cancelled"], accepted: ["cancelled"], declined: [], cancelled: [] };

export function listWorkCatalog() {
  return {
    departments: DEPARTMENTS,
    orders: ORDERS,
    plans: PLANS,
    referrals: REFERRALS,
    attachments: ATTACHMENTS,
    conformance: "Local synthetic coordination codes only. Nothing here is transmitted, resulted, or dispensed.",
  };
}

function requireOpen(db: AppDatabase) {
  const control = get<{ value: string }>(db, `SELECT value FROM work_controls WHERE name = 'dependency'`);
  if (!control || control.value !== "available") throw new ConflictError("conflict", "Work coordination is unavailable.");
}

function gate(db: AppDatabase, actor: WorkActor, permission: string) {
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
    { type: "WorkCoordination", organizationId: actor.organizationId, facilityId: actor.facilityId, sensitivity: "clinical" },
    { purpose, assurance: "directory", sessionActive: true, activeFacilityId: actor.facilityId, correlationId: actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) },
  );
  if (!decision.allow) throw new ForbiddenError("forbidden", "Work coordination is not permitted for this session.");
}

function sessionFor(db: AppDatabase, actor: WorkActor): SessionContext {
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
  run(db, `INSERT INTO work_metrics (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1`, name);
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function readCommand<T>(db: AppDatabase, organizationId: string, key: string, hash: string): T | undefined {
  const row = get<{ request_hash: string; response_json: string }>(db, `SELECT request_hash, response_json FROM work_commands WHERE organization_id = ? AND command_key = ?`, organizationId, key);
  if (!row) return undefined;
  if (row.request_hash !== hash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  return JSON.parse(row.response_json) as T;
}

function newId(prefix: string) {
  return `${prefix}${randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

function assertPatient(db: AppDatabase, actor: WorkActor, patientId: string) {
  const patient = get<{ organization_id: string; facility_id: string; registration_status: string }>(db, `SELECT organization_id, facility_id, registration_status FROM patients WHERE id = ?`, patientId);
  if (!patient || patient.organization_id !== actor.organizationId) throw new NotFoundError("That patient is not available.");
  if (patient.registration_status === "merged") throw new ValidationError("invalid", "That patient is superseded. Use the surviving record.");
  if (patient.registration_status !== "active") throw new ValidationError("invalid", "That patient is not active.");
  const registered = patient.facility_id === actor.facilityId || get(db, `SELECT id FROM patient_facility_registrations WHERE patient_id = ? AND facility_id = ? AND status = 'active'`, patientId, actor.facilityId);
  if (!registered) throw new NotFoundError("That patient is not available.");
}

function assertPractitioner(db: AppDatabase, actor: WorkActor, practitionerId: string) {
  const practitioner = get<{ status: string; organization_id: string }>(db, `SELECT status, organization_id FROM practitioners WHERE id = ?`, practitionerId);
  if (!practitioner || practitioner.organization_id !== actor.organizationId) throw new NotFoundError("That practitioner is not available.");
  if (practitioner.status !== "active") throw new ConflictError("conflict", "That practitioner is not available.");
  const affiliation = get(db, `SELECT id FROM practitioner_affiliations WHERE practitioner_id = ? AND facility_id = ? AND status = 'active'`, practitionerId, actor.facilityId);
  if (!affiliation) throw new ValidationError("invalid", "That practitioner is not affiliated with this facility.");
}

function assertEncounter(db: AppDatabase, actor: WorkActor, encounterId: string, patientId: string, mode: "record" | "amend") {
  const row = get<{ patient_id: string; organization_id: string; facility_id: string; status: string }>(db, `SELECT patient_id, organization_id, facility_id, status FROM visit_encounters WHERE id = ?`, encounterId);
  if (!row || row.organization_id !== actor.organizationId || row.facility_id !== actor.facilityId) throw new NotFoundError("That encounter is not available.");
  if (row.patient_id !== patientId) throw new ConflictError("conflict", "That encounter is not for this patient.");
  if (row.status === "completed" && mode === "record") throw new ConflictError("conflict", "That encounter is closed. Ordinary recording is not available.");
  if (row.status !== "in-progress" && row.status !== "completed") throw new ConflictError("conflict", "That encounter is not open for source entries.");
}

function assertDue(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ValidationError("invalid", "The due date is not valid.");
}

function department(id: string) {
  const row = DEPARTMENTS.find((item) => item.id === id);
  if (!row) throw new ValidationError("code", "That department is not on the synthetic catalog.");
  return row;
}

function remember(db: AppDatabase, actor: WorkActor, kind: string, recordId: string, version: number, prior: number | null, encounterId: string | null, reason: string | null, snapshot: unknown, now: string) {
  run(
    db,
    `INSERT INTO work_versions (id, organization_id, record_kind, record_id, version, prior_version, actor_id, facility_id, encounter_id, recorded_at, amended_at, reason, snapshot_json, correlation_id)
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
  if (!matrix[current]?.includes(next)) throw new ConflictError("conflict", `That ${label} change is not allowed.`);
}

function audit(db: AppDatabase, actor: WorkActor, action: string, resourceType: string, resourceId: string) {
  writeAudit(db, sessionFor(db, actor), { action, resourceType, resourceId, outcome: "success" });
}

export function submitOrder(db: AppDatabase, actor: WorkActor, input: { patientId: string; encounterId: string; practitionerId: string; code: string; departmentId: string; priority: string; dueOn: string; idempotencyKey: string; catalogItemVersionId?: string; coding?: CodingSelection }) {
  gate(db, actor, "work.order.submit");
  assertKey(input.idempotencyKey);
  const hash = codingCommandHash(input.catalogItemVersionId ? JSON.stringify(["catalog-order", actor.userId,actor.facilityId,input.patientId,input.encounterId,input.practitionerId,input.catalogItemVersionId,input.departmentId,input.priority,input.dueOn]) : JSON.stringify(["order", input.patientId, input.encounterId, input.code, input.departmentId, input.priority, input.dueOn]),input.coding,actor);
  const prior = readCommand<{ id: string; version: number; status: string; idempotent?: boolean }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const catalog = input.catalogItemVersionId ? catalogForOrder(db,sessionFor(db,actor),input.catalogItemVersionId) : null;
  const concept = catalog ? { code:catalog.item.code,system:catalog.item.system,version:catalog.item.code_system_version,display:catalog.item.display,category:catalog.item.order_category } : ORDERS.find((item) => item.code === input.code);
  if (!concept) throw new ValidationError("code", "That code is not on the synthetic catalog.");
  const destination = department(input.departmentId);
  if (destination.organizationId !== actor.organizationId || destination.kind !== concept.category) throw new ValidationError("code", "That department cannot receive this request.");
  if (input.priority !== "routine" && input.priority !== "urgent") throw new ValidationError("invalid", "That priority is not supported.");
  assertDue(input.dueOn);
  assertPatient(db, actor, input.patientId);
  assertPractitioner(db, actor, input.practitionerId);
  assertEncounter(db, actor, input.encounterId, input.patientId, "record");
  const now = new Date().toISOString();
  const id = newId("ord_");
  const taskId = newId("tsk_");
  const response = { id, taskId, version: 1, status: "submitted" };
  const snapshot = { code: concept.code, display: concept.display, status: "submitted", departmentId: destination.id, priority: input.priority, dueOn: input.dueOn, fulfillment: "not-transmitted", ...(catalog?{catalog:catalog.snapshot}:{}) };
  try {
    transaction(db, () => {
      const again = readCommand<typeof response>(db, actor.organizationId, input.idempotencyKey, hash);
      if (again) return;
      // Revalidate within the order transaction so a changed head cannot race the picker.
      if (input.catalogItemVersionId) catalogForOrder(db,sessionFor(db,actor),input.catalogItemVersionId);
      run(
        db,
        `INSERT INTO work_orders (id, organization_id, facility_id, destination_department_id, patient_id, encounter_id, practitioner_id, code, code_system, code_system_version, display, category, priority, status, due_on, fulfillment, recorded_at, recorded_by, version, correlation_id, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, 'not-transmitted', ?, ?, 1, ?, ?, ?)`,
        id,
        actor.organizationId,
        actor.facilityId,
        destination.id,
        input.patientId,
        input.encounterId,
        input.practitionerId,
        concept.code,
        concept.system,
        concept.version,
        concept.display,
        concept.category,
        input.priority,
        input.dueOn,
        now,
        actor.userId,
        actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
        now,
        now,
      );
      pinClinicalCoding(db,actor,"work-order",id,workCodingDefinition(concept,catalog?.snapshot),input.coding);
      if(catalog) run(db,"INSERT INTO work_order_catalog_pins(order_id,organization_id,facility_id,entry_version_id,snapshot_json,created_at) VALUES(?,?,?,?,?,?)",id,actor.organizationId,actor.facilityId,catalog.item.id,JSON.stringify(catalog.snapshot),now);
      run(
        db,
        `INSERT INTO work_tasks (id, organization_id, facility_id, parent_kind, parent_id, patient_id, status, assignee_user_id, due_on, recorded_at, recorded_by, version, correlation_id)
         VALUES (?, ?, ?, 'order', ?, ?, 'open', NULL, ?, ?, ?, 1, ?)`,
        taskId,
        actor.organizationId,
        destination.facilityId,
        id,
        input.patientId,
        input.dueOn,
        now,
        actor.userId,
        actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
      );
      remember(db, actor, "order", id, 1, null, input.encounterId, null, snapshot, now);
      remember(db, actor, "task", taskId, 1, null, input.encounterId, null, { status: "open", parentId: id, assignee: null }, now);
      run(db, `INSERT INTO work_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
      countMetric(db, "work.order.submitted");
      audit(db, actor, "work.order.submit", "WorkOrder", id);
    });
  } catch (error) {
    const stored = readCommand<typeof response>(db, actor.organizationId, input.idempotencyKey, hash);
    if (stored) return { ...stored, idempotent: true };
    throw error;
  }
  const stored = readCommand<typeof response>(db, actor.organizationId, input.idempotencyKey, hash);
  return stored ? { ...stored, idempotent: false } : { ...response, idempotent: false };
}

function orderVisible(db: AppDatabase, actor: WorkActor, id: string) {
  const row = get<{ organization_id: string; facility_id: string; destination_department_id: string; status: string; version: number; patient_id: string; encounter_id: string; code: string; display: string; priority: string; due_on: string; fulfillment: string; category: string }>(
    db,
    `SELECT organization_id, facility_id, destination_department_id, status, version, patient_id, encounter_id, code, display, priority, due_on, fulfillment, category FROM work_orders WHERE id = ?`,
    id,
  );
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That record is not available.");
  const destination = department(row.destination_department_id);
  if (row.facility_id !== actor.facilityId && destination.facilityId !== actor.facilityId) throw new NotFoundError("That record is not available.");
  return { ...row, destinationFacilityId: destination.facilityId };
}

export function routeOrder(db: AppDatabase, actor: WorkActor, id: string, input: { expectedVersion: number; idempotencyKey: string }) {
  gate(db, actor, "work.order.route");
  assertKey(input.idempotencyKey);
  const hash = JSON.stringify(["route", id, input.expectedVersion]);
  const prior = readCommand<{ id: string; version: number; status: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const row = orderVisible(db, actor, id);
  move(row.status, "routed", ORDER_NEXT, "order");
  const now = new Date().toISOString();
  const response = { id, version: row.version + 1, status: "routed" };
  transaction(db, () => {
    const changed = run(db, `UPDATE work_orders SET status = 'routed', version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, now, id, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    remember(db, actor, "order", id, row.version + 1, row.version, row.encounter_id, "routed", { code: row.code, status: "routed", departmentId: row.destination_department_id, fulfillment: "not-transmitted" }, now);
    run(db, `INSERT INTO work_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, "work.order.routed");
    audit(db, actor, "work.order.route", "WorkOrder", id);
  });
  return { ...response, idempotent: false };
}

export function cancelOrder(db: AppDatabase, actor: WorkActor, id: string, input: { expectedVersion: number; reason: string; idempotencyKey: string }) {
  gate(db, actor, "work.order.cancel");
  assertKey(input.idempotencyKey);
  if (input.reason !== "entered-in-error" && input.reason !== "no-longer-needed") throw new ValidationError("invalid", "A cancellation reason is required.");
  const hash = JSON.stringify(["cancel-order", id, input.expectedVersion, input.reason]);
  const prior = readCommand<{ id: string; version: number; status: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const row = orderVisible(db, actor, id);
  if (row.facility_id !== actor.facilityId) throw new ForbiddenError();
  assertEncounter(db, actor, row.encounter_id, row.patient_id, "amend");
  move(row.status, "cancelled", ORDER_NEXT, "order");
  const now = new Date().toISOString();
  const response = { id, version: row.version + 1, status: "cancelled" };
  transaction(db, () => {
    const changed = run(db, `UPDATE work_orders SET status = 'cancelled', version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, now, id, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    run(db, `UPDATE work_tasks SET status = 'cancelled', version = version + 1 WHERE parent_kind = 'order' AND parent_id = ? AND status IN ('open','assigned')`, id);
    remember(db, actor, "order", id, row.version + 1, row.version, row.encounter_id, input.reason, { code: row.code, status: "cancelled", fulfillment: "not-transmitted" }, now);
    run(db, `INSERT INTO work_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, "work.order.cancelled");
    audit(db, actor, "work.order.cancel", "WorkOrder", id);
  });
  return { ...response, idempotent: false };
}

export function readOrder(db: AppDatabase, actor: WorkActor, id: string) {
  gate(db, actor, "work.order.read");
  const row = orderVisible(db, actor, id);
  audit(db, actor, "work.order.read", "WorkOrder", id);
  const pin=get<{snapshot_json:string}>(db,"SELECT snapshot_json FROM work_order_catalog_pins WHERE order_id=? AND organization_id=?",id,actor.organizationId);
  return {...row,coding:codingForAuthorizedSource(db,actor.organizationId,"work-order",id),catalogSnapshot:pin?JSON.parse(pin.snapshot_json) as OrderCatalogSnapshot:null};
}

export function listOrders(db: AppDatabase, actor: WorkActor, patientId: string) {
  gate(db, actor, "work.order.read");
  assertPatient(db, actor, patientId);
  return all<{ id: string; code: string; display: string; status: string; version: number; due_on: string; destination_department_id: string; fulfillment: string }>(
    db,
    `SELECT id, code, display, status, version, due_on, destination_department_id, fulfillment FROM work_orders WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at`,
    actor.organizationId,
    actor.facilityId,
    patientId,
  );
}

export function recordPlan(db: AppDatabase, actor: WorkActor, input: { patientId: string; encounterId: string; practitionerId: string; code: string; ownerUserId: string; dueOn: string; idempotencyKey: string }) {
  gate(db, actor, "work.plan.record");
  assertKey(input.idempotencyKey);
  const hash = JSON.stringify(["plan", input.patientId, input.encounterId, input.code, input.ownerUserId, input.dueOn]);
  const prior = readCommand<{ id: string; version: number; status: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const concept = PLANS.find((item) => item.code === input.code);
  if (!concept) throw new ValidationError("code", "That code is not on the synthetic catalog.");
  assertDue(input.dueOn);
  assertPatient(db, actor, input.patientId);
  assertPractitioner(db, actor, input.practitionerId);
  assertEncounter(db, actor, input.encounterId, input.patientId, "record");
  const owner = get(db, `SELECT id FROM facility_memberships WHERE user_id = ? AND facility_id = ? AND status = 'active'`, input.ownerUserId, actor.facilityId);
  if (!owner) throw new ValidationError("invalid", "That owner is not an active member of this facility.");
  const now = new Date().toISOString();
  const id = newId("cpl_");
  const taskId = newId("tsk_");
  const response = { id, taskId, version: 1, status: "active" };
  transaction(db, () => {
    run(
      db,
      `INSERT INTO work_plans (id, organization_id, facility_id, patient_id, encounter_id, practitioner_id, code, code_system, code_system_version, display, status, owner_user_id, due_on, recorded_at, recorded_by, version, correlation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, 1, ?, ?, ?)`,
      id,
      actor.organizationId,
      actor.facilityId,
      input.patientId,
      input.encounterId,
      input.practitionerId,
      concept.code,
      concept.system,
      concept.version,
      concept.display,
      input.ownerUserId,
      input.dueOn,
      now,
      actor.userId,
      actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
      now,
      now,
    );
    run(
      db,
      `INSERT INTO work_tasks (id, organization_id, facility_id, parent_kind, parent_id, patient_id, status, assignee_user_id, due_on, recorded_at, recorded_by, version, correlation_id)
       VALUES (?, ?, ?, 'plan', ?, ?, 'assigned', ?, ?, ?, ?, 1, ?)`,
      taskId,
      actor.organizationId,
      actor.facilityId,
      id,
      input.patientId,
      input.ownerUserId,
      input.dueOn,
      now,
      actor.userId,
      actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
    );
    remember(db, actor, "plan", id, 1, null, input.encounterId, null, { code: concept.code, status: "active", ownerUserId: input.ownerUserId, dueOn: input.dueOn }, now);
    run(db, `INSERT INTO work_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, "work.plan.recorded");
    audit(db, actor, "work.plan.record", "CarePlan", id);
  });
  return { ...response, idempotent: false };
}

export function updatePlan(db: AppDatabase, actor: WorkActor, id: string, input: { expectedVersion: number; status: string; reason: string; idempotencyKey: string }) {
  gate(db, actor, "work.plan.update");
  assertKey(input.idempotencyKey);
  if (input.status !== "completed" && input.status !== "cancelled") throw new ValidationError();
  if (input.reason !== "completed" && input.reason !== "no-longer-needed") throw new ValidationError("invalid", "A change reason is required.");
  const hash = JSON.stringify(["plan-update", id, input.expectedVersion, input.status, input.reason]);
  const prior = readCommand<{ id: string; version: number; status: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const row = get<{ organization_id: string; facility_id: string; status: string; version: number; encounter_id: string; patient_id: string; code: string }>(db, `SELECT organization_id, facility_id, status, version, encounter_id, patient_id, code FROM work_plans WHERE id = ?`, id);
  if (!row || row.organization_id !== actor.organizationId || row.facility_id !== actor.facilityId) throw new NotFoundError("That record is not available.");
  assertEncounter(db, actor, row.encounter_id, row.patient_id, "amend");
  move(row.status, input.status, PLAN_NEXT, "care plan");
  const now = new Date().toISOString();
  const response = { id, version: row.version + 1, status: input.status };
  transaction(db, () => {
    const changed = run(db, `UPDATE work_plans SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, input.status, now, id, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    if (input.status === "cancelled") run(db, `UPDATE work_tasks SET status = 'cancelled', version = version + 1 WHERE parent_kind = 'plan' AND parent_id = ? AND status IN ('open','assigned')`, id);
    remember(db, actor, "plan", id, row.version + 1, row.version, row.encounter_id, input.reason, { code: row.code, status: input.status }, now);
    run(db, `INSERT INTO work_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, "work.plan.updated");
    audit(db, actor, "work.plan.update", "CarePlan", id);
  });
  return { ...response, idempotent: false };
}

export function listPlans(db: AppDatabase, actor: WorkActor, patientId: string) {
  gate(db, actor, "work.plan.read");
  assertPatient(db, actor, patientId);
  return all<{ id: string; code: string; display: string; status: string; version: number; due_on: string; owner_user_id: string }>(db, `SELECT id, code, display, status, version, due_on, owner_user_id FROM work_plans WHERE organization_id = ? AND facility_id = ? AND patient_id = ? ORDER BY created_at`, actor.organizationId, actor.facilityId, patientId);
}

export function readPlan(db: AppDatabase, actor: WorkActor, id: string) {
  gate(db, actor, "work.plan.read");
  const row = get<{ organization_id: string; facility_id: string; code: string; display: string; status: string; version: number; due_on: string; owner_user_id: string; patient_id: string }>(db, `SELECT organization_id, facility_id, code, display, status, version, due_on, owner_user_id, patient_id FROM work_plans WHERE id = ?`, id);
  if (!row || row.organization_id !== actor.organizationId || row.facility_id !== actor.facilityId) throw new NotFoundError("That record is not available.");
  audit(db, actor, "work.plan.read", "CarePlan", id);
  return row;
}

export function submitReferral(db: AppDatabase, actor: WorkActor, input: { patientId: string; encounterId: string; practitionerId: string; code: string; toFacilityId: string; dueOn: string; idempotencyKey: string }) {
  gate(db, actor, "work.referral.submit");
  assertKey(input.idempotencyKey);
  const hash = JSON.stringify(["referral", input.patientId, input.encounterId, input.code, input.toFacilityId, input.dueOn]);
  const prior = readCommand<{ id: string; version: number; status: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const concept = REFERRALS.find((item) => item.code === input.code);
  if (!concept) throw new ValidationError("code", "That code is not on the synthetic catalog.");
  const destination = get<{ organization_id: string }>(db, `SELECT organization_id FROM facilities WHERE id = ?`, input.toFacilityId);
  if (!destination || destination.organization_id !== actor.organizationId || input.toFacilityId === actor.facilityId) throw new ValidationError("code", "That destination facility is not available.");
  assertDue(input.dueOn);
  assertPatient(db, actor, input.patientId);
  assertPractitioner(db, actor, input.practitionerId);
  assertEncounter(db, actor, input.encounterId, input.patientId, "record");
  const now = new Date().toISOString();
  const id = newId("ref_");
  const taskId = newId("tsk_");
  const response = { id, taskId, version: 1, status: "submitted" };
  transaction(db, () => {
    run(
      db,
      `INSERT INTO work_referrals (id, organization_id, from_facility_id, to_facility_id, patient_id, encounter_id, practitioner_id, code, code_system, code_system_version, display, status, due_on, recorded_at, recorded_by, version, correlation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'submitted', ?, ?, ?, 1, ?, ?, ?)`,
      id,
      actor.organizationId,
      actor.facilityId,
      input.toFacilityId,
      input.patientId,
      input.encounterId,
      input.practitionerId,
      concept.code,
      concept.system,
      concept.version,
      concept.display,
      input.dueOn,
      now,
      actor.userId,
      actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
      now,
      now,
    );
    run(
      db,
      `INSERT INTO work_tasks (id, organization_id, facility_id, parent_kind, parent_id, patient_id, status, assignee_user_id, due_on, recorded_at, recorded_by, version, correlation_id)
       VALUES (?, ?, ?, 'referral', ?, ?, 'open', NULL, ?, ?, ?, 1, ?)`,
      taskId,
      actor.organizationId,
      input.toFacilityId,
      id,
      input.patientId,
      input.dueOn,
      now,
      actor.userId,
      actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80),
    );
    remember(db, actor, "referral", id, 1, null, input.encounterId, null, { code: concept.code, status: "submitted", toFacilityId: input.toFacilityId, dueOn: input.dueOn }, now);
    run(db, `INSERT INTO work_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, "work.referral.submitted");
    audit(db, actor, "work.referral.submit", "Referral", id);
  });
  return { ...response, idempotent: false };
}

function referralVisible(db: AppDatabase, actor: WorkActor, id: string) {
  const row = get<{ organization_id: string; from_facility_id: string; to_facility_id: string; status: string; version: number; patient_id: string; encounter_id: string; code: string; display: string; due_on: string }>(
    db,
    `SELECT organization_id, from_facility_id, to_facility_id, status, version, patient_id, encounter_id, code, display, due_on FROM work_referrals WHERE id = ?`,
    id,
  );
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That record is not available.");
  if (row.from_facility_id !== actor.facilityId && row.to_facility_id !== actor.facilityId) throw new NotFoundError("That record is not available.");
  return row;
}

export function decideWorkReferral(db: AppDatabase, actor: WorkActor, id: string, input: { expectedVersion: number; decision: string; idempotencyKey: string }) {
  gate(db, actor, "work.referral.decide");
  assertKey(input.idempotencyKey);
  if (input.decision !== "accepted" && input.decision !== "declined") throw new ValidationError();
  const hash = JSON.stringify(["referral-decision", id, input.expectedVersion, input.decision]);
  const prior = readCommand<{ id: string; version: number; status: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const row = referralVisible(db, actor, id);
  if (row.to_facility_id !== actor.facilityId) throw new ForbiddenError();
  move(row.status, input.decision, REFERRAL_NEXT, "referral");
  const now = new Date().toISOString();
  const response = { id, version: row.version + 1, status: input.decision };
  transaction(db, () => {
    const changed = run(db, `UPDATE work_referrals SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, input.decision, now, id, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    if (input.decision === "declined") run(db, `UPDATE work_tasks SET status = 'cancelled', version = version + 1 WHERE parent_kind = 'referral' AND parent_id = ? AND status IN ('open','assigned')`, id);
    remember(db, actor, "referral", id, row.version + 1, row.version, row.encounter_id, input.decision, { code: row.code, status: input.decision, toFacilityId: row.to_facility_id }, now);
    run(db, `INSERT INTO work_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, "work.referral.decided");
    audit(db, actor, "work.referral.decide", "Referral", id);
  });
  return { ...response, idempotent: false };
}

export function cancelReferral(db: AppDatabase, actor: WorkActor, id: string, input: { expectedVersion: number; reason: string; idempotencyKey: string }) {
  gate(db, actor, "work.referral.cancel");
  assertKey(input.idempotencyKey);
  if (input.reason !== "entered-in-error" && input.reason !== "no-longer-needed") throw new ValidationError("invalid", "A cancellation reason is required.");
  const hash = JSON.stringify(["cancel-referral", id, input.expectedVersion, input.reason]);
  const prior = readCommand<{ id: string; version: number; status: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const row = referralVisible(db, actor, id);
  if (row.from_facility_id !== actor.facilityId) throw new ForbiddenError();
  assertEncounter(db, actor, row.encounter_id, row.patient_id, "amend");
  move(row.status, "cancelled", REFERRAL_NEXT, "referral");
  const now = new Date().toISOString();
  const response = { id, version: row.version + 1, status: "cancelled" };
  transaction(db, () => {
    const changed = run(db, `UPDATE work_referrals SET status = 'cancelled', version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, now, id, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    run(db, `UPDATE work_tasks SET status = 'cancelled', version = version + 1 WHERE parent_kind = 'referral' AND parent_id = ? AND status IN ('open','assigned')`, id);
    remember(db, actor, "referral", id, row.version + 1, row.version, row.encounter_id, input.reason, { code: row.code, status: "cancelled" }, now);
    run(db, `INSERT INTO work_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, "work.referral.cancelled");
    audit(db, actor, "work.referral.cancel", "Referral", id);
  });
  return { ...response, idempotent: false };
}

export function readReferral(db: AppDatabase, actor: WorkActor, id: string) {
  gate(db, actor, "work.referral.read");
  const row = referralVisible(db, actor, id);
  audit(db, actor, "work.referral.read", "Referral", id);
  return row;
}

export function listReferrals(db: AppDatabase, actor: WorkActor, patientId: string) {
  gate(db, actor, "work.referral.read");
  assertPatient(db, actor, patientId);
  return all<{ id: string; code: string; display: string; status: string; version: number; to_facility_id: string; due_on: string }>(db, `SELECT id, code, display, status, version, to_facility_id, due_on FROM work_referrals WHERE organization_id = ? AND from_facility_id = ? AND patient_id = ? ORDER BY created_at`, actor.organizationId, actor.facilityId, patientId);
}

export function assignTask(db: AppDatabase, actor: WorkActor, id: string, input: { expectedVersion: number; assigneeUserId: string; idempotencyKey: string }) {
  gate(db, actor, "work.task.assign");
  assertKey(input.idempotencyKey);
  const hash = JSON.stringify(["assign", id, input.expectedVersion, input.assigneeUserId]);
  const prior = readCommand<{ id: string; version: number; status: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  const row = get<{ organization_id: string; facility_id: string; status: string; version: number; parent_kind: string; parent_id: string }>(db, `SELECT organization_id, facility_id, status, version, parent_kind, parent_id FROM work_tasks WHERE id = ?`, id);
  if (!row || row.organization_id !== actor.organizationId || row.facility_id !== actor.facilityId) throw new NotFoundError("That record is not available.");
  if (row.status !== "open" && row.status !== "assigned") throw new ConflictError("conflict", "That task change is not allowed.");
  const member = get(db, `SELECT id FROM facility_memberships WHERE user_id = ? AND facility_id = ? AND status = 'active'`, input.assigneeUserId, actor.facilityId);
  if (!member) throw new ValidationError("invalid", "That assignee is not an active member of this facility.");
  const now = new Date().toISOString();
  const response = { id, version: row.version + 1, status: "assigned" };
  transaction(db, () => {
    const changed = run(db, `UPDATE work_tasks SET status = 'assigned', assignee_user_id = ?, version = version + 1 WHERE id = ? AND version = ?`, input.assigneeUserId, id, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The record changed. Review the current version.");
    remember(db, actor, "task", id, row.version + 1, row.version, null, "assigned", { status: "assigned", parentId: row.parent_id, assignee: input.assigneeUserId }, now);
    run(db, `INSERT INTO work_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, "work.task.assigned");
    audit(db, actor, "work.task.assign", "WorkTask", id);
  });
  return { ...response, idempotent: false };
}

export function addAttachment(db: AppDatabase, actor: WorkActor, input: { parentKind: string; parentId: string; code: string; byteLength: number; sha256: string; idempotencyKey: string }) {
  gate(db, actor, "work.attachment.add");
  assertKey(input.idempotencyKey);
  const concept = ATTACHMENTS.find((item) => item.code === input.code);
  if (!concept) throw new ValidationError("code", "That attachment is not on the synthetic catalog.");
  if (!Number.isInteger(input.byteLength) || input.byteLength < 1 || input.byteLength > 4096) throw new ValidationError("range", "That attachment size is not accepted.");
  if (!/^[a-f0-9]{64}$/.test(input.sha256)) throw new ValidationError("invalid", "That attachment checksum is not valid.");
  const hash = JSON.stringify(["attachment", input.parentKind, input.parentId, input.code, input.byteLength, input.sha256]);
  const prior = readCommand<{ id: string }>(db, actor.organizationId, input.idempotencyKey, hash);
  if (prior) return { ...prior, idempotent: true };
  if (input.parentKind === "order") orderVisible(db, actor, input.parentId);
  else if (input.parentKind === "plan") readPlan(db, actor, input.parentId);
  else if (input.parentKind === "referral") referralVisible(db, actor, input.parentId);
  else throw new ValidationError();
  const parentStatus = input.parentKind === "order"
    ? orderVisible(db, actor, input.parentId).status
    : input.parentKind === "plan"
      ? get<{ status: string }>(db, `SELECT status FROM work_plans WHERE id = ?`, input.parentId)?.status
      : referralVisible(db, actor, input.parentId).status;
  if (parentStatus === "cancelled") throw new ConflictError("conflict", "That record is cancelled.");
  const now = new Date().toISOString();
  const id = newId("att_");
  const response = { id };
  transaction(db, () => {
    run(
      db,
      `INSERT INTO work_attachments (id, organization_id, facility_id, parent_kind, parent_id, code, display, media_type, byte_length, content_sha256, recorded_at, recorded_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      id,
      actor.organizationId,
      actor.facilityId,
      input.parentKind,
      input.parentId,
      concept.code,
      concept.display,
      concept.mediaType,
      input.byteLength,
      input.sha256,
      now,
      actor.userId,
    );
    run(db, `INSERT INTO work_commands (organization_id, command_key, request_hash, response_json) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, hash, JSON.stringify(response));
    countMetric(db, "work.attachment.added");
    audit(db, actor, "work.attachment.add", "WorkAttachment", id);
  });
  return { ...response, idempotent: false };
}

export function listTasksFor(db: AppDatabase, actor: WorkActor, parentKind: string, parentId: string) {
  gate(db, actor, "work.task.read");
  if (parentKind === "order") orderVisible(db, actor, parentId);
  else if (parentKind === "plan") readPlan(db, actor, parentId);
  else if (parentKind === "referral") referralVisible(db, actor, parentId);
  else throw new ValidationError();
  return all<{ id: string; facility_id: string; status: string; version: number; assignee_user_id: string | null; due_on: string }>(
    db,
    `SELECT id, facility_id, status, version, assignee_user_id, due_on FROM work_tasks WHERE organization_id = ? AND parent_kind = ? AND parent_id = ? ORDER BY recorded_at`,
    actor.organizationId,
    parentKind,
    parentId,
  );
}

export function listPending(db: AppDatabase, actor: WorkActor, patientId?: string) {
  gate(db, actor, "work.pending.read");
  if (!actor.facilityId) throw new ForbiddenError("scope");
  const facilityId = actor.facilityId;
  const orders = all<{ id: string; code: string; display: string; status: string; due_on: string; facility_id: string }>(
    db,
    `SELECT o.id, o.code, o.display, o.status, o.due_on, o.facility_id
     FROM work_orders o JOIN work_departments d ON d.id = o.destination_department_id
     WHERE o.organization_id = ? AND o.status IN ('submitted','routed') AND (o.facility_id = ? OR d.facility_id = ?)
       AND (? IS NULL OR o.patient_id = ?)
     ORDER BY o.due_on, o.id`,
    actor.organizationId,
    facilityId,
    facilityId,
    patientId ?? null,
    patientId ?? null,
  );
  const tasks = all<{ id: string; parent_kind: string; parent_id: string; status: string; due_on: string; assignee_user_id: string | null }>(
    db,
    `SELECT id, parent_kind, parent_id, status, due_on, assignee_user_id FROM work_tasks WHERE organization_id = ? AND facility_id = ? AND status IN ('open','assigned') AND (? IS NULL OR patient_id = ?) ORDER BY due_on, id`,
    actor.organizationId,
    facilityId,
    patientId ?? null,
    patientId ?? null,
  );
  const referrals = all<{ id: string; code: string; display: string; status: string; due_on: string; from_facility_id: string }>(
    db,
    `SELECT id, code, display, status, due_on, from_facility_id FROM work_referrals WHERE organization_id = ? AND status = 'submitted' AND (from_facility_id = ? OR to_facility_id = ?) AND (? IS NULL OR patient_id = ?) ORDER BY due_on, id`,
    actor.organizationId,
    facilityId,
    facilityId,
    patientId ?? null,
    patientId ?? null,
  );
  const plans = all<{ id: string; code: string; display: string; status: string; due_on: string; owner_user_id: string }>(
    db,
    `SELECT id, code, display, status, due_on, owner_user_id FROM work_plans WHERE organization_id = ? AND facility_id = ? AND status = 'active' AND (? IS NULL OR patient_id = ?) ORDER BY due_on, id`,
    actor.organizationId,
    facilityId,
    patientId ?? null,
    patientId ?? null,
  );
  audit(db, actor, "work.pending.read", "WorkQueue", facilityId);
  return { orders, tasks, referrals, plans };
}

export function workHistory(db: AppDatabase, actor: WorkActor, kind: string, id: string) {
  gate(db, actor, "work.history.read");
  if (!["order", "plan", "referral", "task"].includes(kind)) throw new ValidationError();
  if (kind === "order") orderVisible(db, actor, id);
  if (kind === "plan") readPlan(db, actor, id);
  if (kind === "referral") referralVisible(db, actor, id);
  if (kind === "task") {
    const task = get<{ organization_id: string; facility_id: string }>(db, `SELECT organization_id, facility_id FROM work_tasks WHERE id = ?`, id);
    if (!task || task.organization_id !== actor.organizationId || task.facility_id !== actor.facilityId) throw new NotFoundError("That record is not available.");
  }
  const rows = all<{ version: number; prior_version: number | null; actor_id: string; reason: string | null; snapshot_json: string; recorded_at: string; amended_at: string | null }>(
    db,
    `SELECT version, prior_version, actor_id, reason, snapshot_json, recorded_at, amended_at FROM work_versions WHERE organization_id = ? AND record_kind = ? AND record_id = ? ORDER BY version`,
    actor.organizationId,
    kind,
    id,
  ).map((row) => ({ version: row.version, priorVersion: row.prior_version, actorId: row.actor_id, reason: row.reason, recordedAt: row.recorded_at, amendedAt: row.amended_at, snapshot: JSON.parse(row.snapshot_json) as Record<string, unknown> }));
  audit(db, actor, "work.history.read", "WorkCoordination", id);
  return rows;
}

export function listAttachments(db: AppDatabase, actor: WorkActor, parentKind: string, parentId: string) {
  gate(db, actor, "work.order.read");
  if (parentKind === "order") orderVisible(db, actor, parentId);
  else if (parentKind === "referral") referralVisible(db, actor, parentId);
  else if (parentKind === "plan") readPlan(db, actor, parentId);
  else throw new ValidationError();
  return all<{ id: string; code: string; display: string; media_type: string; byte_length: number }>(db, `SELECT id, code, display, media_type, byte_length FROM work_attachments WHERE organization_id = ? AND parent_kind = ? AND parent_id = ? ORDER BY recorded_at`, actor.organizationId, parentKind, parentId);
}

export function transmitWorkOrder(db: AppDatabase, actor: WorkActor) {
  gate(db, actor, "work.order.read");
  countMetric(db, "work.transmit.denied");
  throw new ForbiddenError("forbidden", "Order transmission is disabled.");
}

export function workSnapshot(input: { traceId?: string; display?: string; value?: string } = {}) {
  const trace = (input.traceId ?? "none").replace(/[^A-Za-z0-9_-]/g, "").slice(0, 40);
  return { submitted: 0, routed: 0, cancelled: 0, trace };
}

export function setWorkDependency(db: AppDatabase, value: "available" | "unavailable") {
  run(db, `UPDATE work_controls SET value = ? WHERE name = 'dependency'`, value);
}

export function seedWorkCoordination(db: AppDatabase) {
  run(db, `INSERT INTO work_controls (name, value) VALUES ('dependency', 'available') ON CONFLICT(name) DO NOTHING`);
  for (const item of DEPARTMENTS) {
    run(
      db,
      `INSERT INTO work_departments (id, organization_id, facility_id, kind, display, status) VALUES (?, ?, ?, ?, ?, 'active') ON CONFLICT(id) DO NOTHING`,
      item.id,
      item.organizationId,
      item.facilityId,
      item.kind,
      item.display,
    );
  }
  run(
    db,
    `INSERT OR IGNORE INTO retention_policies (
      id, organization_id, facility_id, jurisdiction, category, classification, trigger_event, duration, duration_unit,
      expiry_action, approval_state, status, version, effective_at, created_at, updated_at
    ) VALUES ('pol_syn_gh_work', 'org_demo_gh', NULL, 'SYNTHETIC_GH', 'care-coordination', 'synthetic', 'record-created', NULL, NULL, 'retain', 'pending_policy_approval', 'active', 1, '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z')`,
  );
}

export const WORK_ROLLBACK = `
DROP TABLE IF EXISTS work_controls;
DROP TABLE IF EXISTS work_metrics;
DROP TABLE IF EXISTS work_commands;
DROP TABLE IF EXISTS work_attachments;
DROP TABLE IF EXISTS work_versions;
DROP TABLE IF EXISTS work_tasks;
DROP TABLE IF EXISTS work_referrals;
DROP TABLE IF EXISTS work_plans;
DROP TABLE IF EXISTS work_orders;
DROP TABLE IF EXISTS work_departments;
DELETE FROM schema_migrations WHERE version IN (41, 42, 43);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (40);
`;
