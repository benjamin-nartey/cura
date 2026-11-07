import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { authorize, effectivePermissions } from "./authorization";
import type { AppDatabase } from "./db";
import { all, get, run, transaction } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { sanitizeTelemetry } from "./telemetry";

type Actor = { userId: string; organizationId: string; facilityId: string | null; sessionId: string };
type AppointmentRow = {
  id: string;
  organization_id: string;
  facility_id: string;
  patient_id: string;
  practitioner_id: string | null;
  category: string | null;
  status: string;
  starts_at: string;
  ends_at: string;
  timezone: string | null;
  version: number;
  arrived_at: string | null;
  source: string;
};

const SERVICES: Record<string, number> = { "follow-up": 20, "new-visit": 30 };
const ACTIVE_RESERVATION = "('held','active')";

function requireOpen(db: AppDatabase) {
  const control = get<{ value: string }>(db, `SELECT value FROM scheduling_controls WHERE name = 'dependency'`);
  if (control && control.value !== "available") throw new ConflictError("conflict", "Scheduling is temporarily unavailable.");
}

function gate(db: AppDatabase, actor: Actor, permission: string) {
  requireOpen(db);
  if (!actor.sessionId || !actor.facilityId) throw new ForbiddenError();
  const permissions = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId).permissions;
  if (!permissions.includes(permission)) throw new ForbiddenError();
  const user = get<{ role: string }>(db, `SELECT role FROM users WHERE id = ?`, actor.userId);
  const purpose = user?.role === "auditor" ? "AUDIT" : user?.role === "admin" ? "OPERATIONS" : "TREATMENT";
  const decision = authorize(
    db,
    { principalId: actor.userId, accountActive: true },
    permission,
    { type: "Appointment", organizationId: actor.organizationId, facilityId: actor.facilityId, sensitivity: "standard" },
    { purpose, assurance: "directory", sessionActive: true, activeFacilityId: actor.facilityId, correlationId: actor.sessionId.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80) },
  );
  if (!decision.allow) throw new ForbiddenError("forbidden", "Scheduling is not permitted for this session.");
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

function countMetric(db: AppDatabase, name: string) {
  run(db, `INSERT INTO scheduling_metrics (name, value) VALUES (?, 1) ON CONFLICT(name) DO UPDATE SET value = value + 1`, name);
}

function commandResult<T>(db: AppDatabase, organizationId: string, key: string): T | undefined {
  const row = get<{ response_json: string }>(db, `SELECT response_json FROM schedule_commands WHERE organization_id = ? AND command_key = ?`, organizationId, key);
  return row ? (JSON.parse(row.response_json) as T) : undefined;
}

function saveCommand(db: AppDatabase, organizationId: string, key: string, response: unknown) {
  run(db, `INSERT INTO schedule_commands (organization_id, command_key, response_json) VALUES (?, ?, ?)`, organizationId, key, JSON.stringify(response));
}

export function offsetMinutes(timeZone: string, date: string) {
  if (timeZone === "Africa/Accra" || timeZone === "UTC") return 0;
  if (timeZone === "Europe/London") {
    const month = Number(date.slice(5, 7));
    const day = Number(date.slice(8, 10));
    if (month > 3 && month < 10) return 60;
    if (month === 10 && day < 25) return 60;
    if (month === 3 && day >= 29) return 60;
    return 0;
  }
  throw new ValidationError("invalid", "That facility timezone is not configured.");
}

export function localToUtc(date: string, time: string, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !/^\d{2}:\d{2}$/.test(time)) throw new ValidationError("invalid", "The date or time is not valid.");
  const offset = offsetMinutes(timeZone, date);
  const utc = Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), Number(time.slice(0, 2)), Number(time.slice(3, 5))) - offset * 60 * 1000;
  return new Date(utc).toISOString();
}

function addMinutes(iso: string, minutes: number) {
  return new Date(Date.parse(iso) + minutes * 60 * 1000).toISOString();
}

function weekday(date: string) {
  return new Date(`${date}T12:00:00.000Z`).getUTCDay();
}

function loadAppointment(db: AppDatabase, actor: Actor, id: string) {
  const row = get<AppointmentRow>(db, `SELECT * FROM appointments WHERE id = ?`, id);
  if (!row || row.organization_id !== actor.organizationId || row.facility_id !== actor.facilityId || row.source === "legacy-chart") {
    throw new NotFoundError("That appointment is not available.");
  }
  return row;
}

function transition(db: AppDatabase, actor: Actor, row: AppointmentRow, expectedVersion: number, next: string, reason: string) {
  if (row.version !== expectedVersion) throw new ConflictError("conflict", "The appointment changed.");
  const allowed: Record<string, string[]> = {
    requested: ["confirmed", "cancelled"],
    confirmed: ["arrived", "cancelled", "no-show"],
    arrived: ["in-progress"],
    "in-progress": ["closed"],
  };
  if (!(allowed[row.status] ?? []).includes(next)) throw new ConflictError("conflict", "That appointment status change is not allowed.");
  const changed = run(
    db,
    `UPDATE appointments SET status = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = ?`,
    next,
    new Date().toISOString(),
    row.id,
    expectedVersion,
    row.status,
  );
  if (changed.changes !== 1) throw new ConflictError("conflict", "The appointment changed.");
  run(
    db,
    `INSERT INTO appointment_events (id, appointment_id, organization_id, from_status, to_status, actor_id, reason, version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    row.id,
    actor.organizationId,
    row.status,
    next,
    actor.userId,
    reason,
    expectedVersion + 1,
    new Date().toISOString(),
  );
  countMetric(db, `appointment.${next}`);
}

function overlaps(db: AppDatabase, input: { practitionerId: string; resourceId: string; startsAt: string; endsAt: string; exceptId?: string }) {
  const except = input.exceptId ?? "";
  const practitionerHits = get<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM scheduling_reservations
     WHERE practitioner_id = ? AND status IN ${ACTIVE_RESERVATION} AND starts_at < ? AND ends_at > ? AND id != ?`,
    input.practitionerId,
    input.endsAt,
    input.startsAt,
    except,
  );
  const resourceHits = get<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM scheduling_reservations
     WHERE resource_id = ? AND status IN ${ACTIVE_RESERVATION} AND starts_at < ? AND ends_at > ? AND id != ?`,
    input.resourceId,
    input.endsAt,
    input.startsAt,
    except,
  );
  const capacity = get<{ capacity: number }>(db, `SELECT capacity FROM scheduling_resources WHERE id = ?`, input.resourceId);
  return Number(practitionerHits?.c ?? 0) >= 1 || Number(resourceHits?.c ?? 0) >= Number(capacity?.capacity ?? 1);
}

function assertSlot(db: AppDatabase, actor: Actor, input: { patientId: string; practitionerId: string; category: string; startsAt: string; endsAt: string; resourceId: string }) {
  const minutes = SERVICES[input.category];
  if (!minutes) throw new ValidationError("invalid", "That appointment category is not configured.");
  if (Date.parse(input.endsAt) - Date.parse(input.startsAt) !== minutes * 60 * 1000) throw new ValidationError("invalid", "That duration does not match the service.");
  if (!(input.startsAt < input.endsAt)) throw new ValidationError("invalid", "The start must precede the end.");
  if (Date.parse(input.startsAt) < Date.now() - 60_000) throw new ValidationError("invalid", "Past scheduling is not permitted.");
  const patient = get<{ organization_id: string; facility_id: string; registration_status: string; merged_into_id: string | null }>(
    db,
    `SELECT organization_id, facility_id, registration_status, merged_into_id FROM patients WHERE id = ?`,
    input.patientId,
  );
  if (!patient || patient.organization_id !== actor.organizationId) throw new NotFoundError("That patient is not available.");
  if (patient.registration_status === "merged") throw new ValidationError("invalid", "That patient is superseded. Use the surviving record.");
  if (patient.registration_status !== "active") throw new ValidationError("invalid", "That patient is not active.");
  const registered = patient.facility_id === actor.facilityId || get(db, `SELECT id FROM patient_facility_registrations WHERE patient_id = ? AND facility_id = ? AND status = 'active'`, input.patientId, actor.facilityId);
  if (!registered) throw new NotFoundError("That patient is not available.");
  const practitioner = get<{ status: string; organization_id: string }>(db, `SELECT status, organization_id FROM practitioners WHERE id = ?`, input.practitionerId);
  if (!practitioner || practitioner.organization_id !== actor.organizationId) throw new NotFoundError("That practitioner is not available.");
  if (practitioner.status !== "active") throw new ConflictError("conflict", "That practitioner is not available for booking.");
  const affiliation = get(db, `SELECT id FROM practitioner_affiliations WHERE practitioner_id = ? AND facility_id = ? AND status = 'active'`, input.practitionerId, actor.facilityId);
  if (!affiliation) throw new ValidationError("invalid", "That practitioner is not affiliated with this facility.");
  const resource = get<{ facility_id: string; organization_id: string; capacity: number }>(db, `SELECT facility_id, organization_id, capacity FROM scheduling_resources WHERE id = ? AND status = 'active'`, input.resourceId);
  if (!resource || resource.organization_id !== actor.organizationId || resource.facility_id !== actor.facilityId || resource.capacity < 1) {
    throw new ValidationError("invalid", "That scheduling resource is not available.");
  }
  const facilityClock = get<{ timezone: string }>(db, `SELECT timezone FROM facilities WHERE id = ?`, actor.facilityId);
  const timeZone = facilityClock?.timezone ?? "UTC";
  const local = new Date(Date.parse(input.startsAt) + offsetMinutes(timeZone, input.startsAt.slice(0, 10)) * 60 * 1000);
  const date = local.toISOString().slice(0, 10);
  const minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  const available = get(
    db,
    `SELECT id FROM practitioner_availability
     WHERE practitioner_id = ? AND facility_id = ? AND weekday = ? AND start_minute <= ? AND end_minute >= ?`,
    input.practitionerId,
    actor.facilityId,
    weekday(date),
    minute,
    minute + minutes,
  );
  if (!available) throw new ConflictError("conflict", "That practitioner is not scheduled at that time.");
}

export function requestAppointment(db: AppDatabase, actor: Actor, input: { patientId: string; practitionerId: string; category: string; startsAt: string; endsAt: string; resourceId: string; idempotencyKey: string }) {
  gate(db, actor, "appointment.create");
  db.exec("PRAGMA busy_timeout = 5000");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) throw new ValidationError("invalid", "The submission key is not valid.");
  const prior = commandResult<{ id: string; status: string; version: number }>(db, actor.organizationId, input.idempotencyKey);
  if (prior) return { ...prior, idempotent: true };
  return transaction(db, () => {
    assertSlot(db, actor, input);
    if (overlaps(db, input)) throw new ConflictError("conflict", "That slot is already reserved.");
    const id = `apt_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const now = new Date().toISOString();
    const facility = get<{ timezone: string }>(db, `SELECT timezone FROM facilities WHERE id = ?`, actor.facilityId);
    run(
      db,
      `INSERT INTO appointments (id, organization_id, facility_id, patient_id, practitioner_id, category, status, reason, starts_at, ends_at, timezone, version, source, created_by, correlation_id, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'requested', ?, ?, ?, ?, 1, 'schedule', ?, ?, ?, ?)`,
      id,
      actor.organizationId,
      actor.facilityId,
      input.patientId,
      input.practitionerId,
      input.category,
      input.category,
      input.startsAt,
      input.endsAt,
      facility?.timezone ?? "UTC",
      actor.userId,
      actor.sessionId.slice(0, 80),
      now,
      now,
    );
    run(
      db,
      `INSERT INTO scheduling_reservations (id, organization_id, facility_id, practitioner_id, resource_id, appointment_id, starts_at, ends_at, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'held')`,
      `${id}:res`,
      actor.organizationId,
      actor.facilityId,
      input.practitionerId,
      input.resourceId,
      id,
      input.startsAt,
      input.endsAt,
    );
    run(
      db,
      `INSERT INTO appointment_events (id, appointment_id, organization_id, from_status, to_status, actor_id, reason, version, created_at)
       VALUES (?, ?, ?, 'none', 'requested', ?, 'requested', 1, ?)`,
      randomUUID(),
      id,
      actor.organizationId,
      actor.userId,
      now,
    );
    writeAudit(db, sessionFor(db, actor), { action: "appointment.request", resourceType: "Appointment", resourceId: id, outcome: "success" });
    countMetric(db, "appointment.requested");
    const response = { id, status: "requested", version: 1 };
    saveCommand(db, actor.organizationId, input.idempotencyKey, response);
    return { ...response, idempotent: false };
  });
}

export function confirmAppointment(db: AppDatabase, actor: Actor, id: string, expectedVersion: number) {
  gate(db, actor, "appointment.confirm");
  return transaction(db, () => {
    const row = loadAppointment(db, actor, id);
    transition(db, actor, row, expectedVersion, "confirmed", "confirmed");
    run(db, `UPDATE scheduling_reservations SET status = 'active' WHERE appointment_id = ? AND status = 'held'`, id);
    run(db, `UPDATE appointments SET confirmed_by = ? WHERE id = ?`, actor.userId, id);
    writeAudit(db, sessionFor(db, actor), { action: "appointment.confirm", resourceType: "Appointment", resourceId: id, outcome: "success" });
    return { id, status: "confirmed", version: expectedVersion + 1 };
  });
}

export function arriveAppointment(db: AppDatabase, actor: Actor, id: string, expectedVersion: number) {
  gate(db, actor, "appointment.arrive");
  return transaction(db, () => {
    const row = loadAppointment(db, actor, id);
    if (row.arrived_at) throw new ConflictError("conflict", "Arrival is already recorded.");
    const arrivedAt = new Date().toISOString();
    transition(db, actor, row, expectedVersion, "arrived", "arrived");
    run(db, `UPDATE appointments SET arrived_at = ? WHERE id = ?`, arrivedAt, id);
    writeAudit(db, sessionFor(db, actor), { action: "appointment.arrive", resourceType: "Appointment", resourceId: id, outcome: "success" });
    return { id, status: "arrived", arrivedAt, version: expectedVersion + 1 };
  });
}

export function cancelAppointment(db: AppDatabase, actor: Actor, id: string, expectedVersion: number, reason: string) {
  gate(db, actor, "appointment.cancel");
  const clean = reason.trim();
  if (!["patient-request", "clinic-request", "entered-in-error"].includes(clean)) throw new ValidationError("invalid", "The cancellation reason is not valid.");
  return transaction(db, () => {
    const row = loadAppointment(db, actor, id);
    transition(db, actor, row, expectedVersion, "cancelled", clean);
    run(db, `UPDATE appointments SET cancellation_reason = ? WHERE id = ?`, clean, id);
    run(db, `UPDATE scheduling_reservations SET status = 'released' WHERE appointment_id = ? AND status IN ('held','active')`, id);
    writeAudit(db, sessionFor(db, actor), { action: "appointment.cancel", resourceType: "Appointment", resourceId: id, outcome: "success" });
    return { id, status: "cancelled", version: expectedVersion + 1 };
  });
}

export function noShowAppointment(db: AppDatabase, actor: Actor, id: string, expectedVersion: number, reason: string, now = new Date().toISOString()) {
  gate(db, actor, "appointment.no-show");
  if (reason !== "window-passed") throw new ValidationError("invalid", "The no-show reason is not valid.");
  return transaction(db, () => {
    const row = loadAppointment(db, actor, id);
    if (row.arrived_at) throw new ConflictError("conflict", "A recorded arrival cannot be marked as a no-show.");
    if (row.ends_at > now) throw new ConflictError("conflict", "The arrival window has not passed.");
    transition(db, actor, row, expectedVersion, "no-show", reason);
    run(db, `UPDATE appointments SET no_show_reason = ? WHERE id = ?`, reason, id);
    run(db, `UPDATE scheduling_reservations SET status = 'released' WHERE appointment_id = ? AND status IN ('held','active')`, id);
    writeAudit(db, sessionFor(db, actor), { action: "appointment.no-show", resourceType: "Appointment", resourceId: id, outcome: "success" });
    return { id, status: "no-show", version: expectedVersion + 1 };
  });
}

export function rescheduleAppointment(db: AppDatabase, actor: Actor, id: string, expectedVersion: number, input: { startsAt: string; endsAt: string }) {
  gate(db, actor, "appointment.reschedule");
  db.exec("PRAGMA busy_timeout = 5000");
  return transaction(db, () => {
    const row = loadAppointment(db, actor, id);
    if (!["requested", "confirmed"].includes(row.status)) throw new ConflictError("conflict", "That appointment cannot be rescheduled.");
    if (row.version !== expectedVersion) throw new ConflictError("conflict", "The appointment changed.");
    const reservation = get<{ id: string; resource_id: string; practitioner_id: string }>(db, `SELECT id, resource_id, practitioner_id FROM scheduling_reservations WHERE appointment_id = ? AND status IN ('held','active')`, id);
    if (!reservation || !row.practitioner_id || !row.category) throw new ConflictError("conflict", "That reservation is not active.");
    assertSlot(db, actor, { patientId: row.patient_id, practitionerId: row.practitioner_id, category: row.category, startsAt: input.startsAt, endsAt: input.endsAt, resourceId: reservation.resource_id });
    if (overlaps(db, { practitionerId: reservation.practitioner_id, resourceId: reservation.resource_id, startsAt: input.startsAt, endsAt: input.endsAt, exceptId: reservation.id })) {
      throw new ConflictError("conflict", "That slot is already reserved.");
    }
    const changed = run(db, `UPDATE appointments SET starts_at = ?, ends_at = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ?`, input.startsAt, input.endsAt, new Date().toISOString(), id, expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The appointment changed.");
    run(db, `UPDATE scheduling_reservations SET starts_at = ?, ends_at = ? WHERE id = ?`, input.startsAt, input.endsAt, reservation.id);
    run(
      db,
      `INSERT INTO appointment_events (id, appointment_id, organization_id, from_status, to_status, actor_id, reason, version, created_at)
       VALUES (?, ?, ?, ?, ?, ?, 'rescheduled', ?, ?)`,
      randomUUID(),
      id,
      actor.organizationId,
      row.status,
      row.status,
      actor.userId,
      expectedVersion + 1,
      new Date().toISOString(),
    );
    writeAudit(db, sessionFor(db, actor), { action: "appointment.reschedule", resourceType: "Appointment", resourceId: id, outcome: "success" });
    countMetric(db, "appointment.rescheduled");
    return { id, status: row.status, startsAt: input.startsAt, endsAt: input.endsAt, version: expectedVersion + 1 };
  });
}

export function listAppointments(db: AppDatabase, actor: Actor, status = "") {
  gate(db, actor, "appointment.read");
  writeAudit(db, sessionFor(db, actor), { action: "appointment.read", resourceType: "Appointment", resourceId: null, outcome: "success" });
  return all<{ id: string; patient_id: string; practitioner_id: string | null; category: string | null; status: string; starts_at: string; ends_at: string; version: number }>(
    db,
    `SELECT id, patient_id, practitioner_id, category, status, starts_at, ends_at, version
     FROM appointments WHERE organization_id = ? AND facility_id = ? AND source = 'schedule' AND (? = '' OR status = ?)
     ORDER BY starts_at LIMIT 50`,
    actor.organizationId,
    actor.facilityId,
    status,
    status,
  );
}

export function readAppointment(db: AppDatabase, actor: Actor, id: string) {
  gate(db, actor, "appointment.read");
  const row = loadAppointment(db, actor, id);
  const events = all<{ from_status: string; to_status: string; actor_id: string; reason: string; version: number; created_at: string }>(
    db,
    `SELECT from_status, to_status, actor_id, reason, version, created_at FROM appointment_events WHERE appointment_id = ? ORDER BY created_at`,
    id,
  );
  const encounter = get<{ id: string; status: string }>(db, `SELECT id, status FROM visit_encounters WHERE appointment_id = ?`, id);
  writeAudit(db, sessionFor(db, actor), { action: "appointment.read", resourceType: "Appointment", resourceId: id, outcome: "success" });
  return { ...row, events, encounter: encounter ?? null };
}

export function facilityClock(db: AppDatabase, actor: Actor) {
  gate(db, actor, "appointment.read");
  return get<{ timezone: string; name: string }>(db, `SELECT timezone, name FROM facilities WHERE id = ? AND organization_id = ?`, actor.facilityId, actor.organizationId);
}

export function listSlots(db: AppDatabase, actor: Actor, practitionerId: string, date: string, category: string) {
  gate(db, actor, "appointment.read");
  const minutes = SERVICES[category];
  if (!minutes || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ValidationError("invalid", "The slot request is not valid.");
  const facility = get<{ timezone: string }>(db, `SELECT timezone FROM facilities WHERE id = ?`, actor.facilityId);
  const timeZone = facility?.timezone ?? "UTC";
  const windows = all<{ start_minute: number; end_minute: number }>(
    db,
    `SELECT start_minute, end_minute FROM practitioner_availability WHERE practitioner_id = ? AND facility_id = ? AND weekday = ?`,
    practitionerId,
    actor.facilityId,
    weekday(date),
  );
  const resource = get<{ id: string }>(db, `SELECT id FROM scheduling_resources WHERE facility_id = ? AND status = 'active' ORDER BY id LIMIT 1`, actor.facilityId);
  const slots: Array<{ startsAt: string; endsAt: string; resourceId: string }> = [];
  if (!resource) return slots;
  for (const window of windows) {
    for (let minute = window.start_minute; minute + minutes <= window.end_minute; minute += minutes) {
      const hh = String(Math.floor(minute / 60)).padStart(2, "0");
      const mm = String(minute % 60).padStart(2, "0");
      const startsAt = localToUtc(date, `${hh}:${mm}`, timeZone);
      const endsAt = addMinutes(startsAt, minutes);
      if (!overlaps(db, { practitionerId, resourceId: resource.id, startsAt, endsAt })) slots.push({ startsAt, endsAt, resourceId: resource.id });
    }
  }
  return slots;
}

export function nextOpenSlot(db: AppDatabase, actor: Actor, practitionerId: string, date: string, category: string, after: string) {
  return listSlots(db, actor, practitionerId, date, category).find((slot) => slot.startsAt > after) ?? null;
}

export function startVisitEncounter(db: AppDatabase, actor: Actor, appointmentId: string, expectedVersion: number, commandKey: string) {
  gate(db, actor, "encounter.start");
  const prior = commandResult<{ id: string; status: string; patientId: string; appointmentId: string; practitionerId: string }>(db, actor.organizationId, commandKey);
  if (prior) return { ...prior, idempotent: true };
  return transaction(db, () => {
    const row = loadAppointment(db, actor, appointmentId);
    if (!row.practitioner_id) throw new ConflictError("conflict", "That appointment has no practitioner.");
    const affiliation = get(db, `SELECT id FROM practitioner_affiliations WHERE practitioner_id = ? AND facility_id = ? AND status = 'active'`, row.practitioner_id, actor.facilityId);
    if (!affiliation) throw new ConflictError("conflict", "That practitioner is not affiliated with this facility.");
    const existing = get<{ id: string; status: string }>(db, `SELECT id, status FROM visit_encounters WHERE appointment_id = ?`, appointmentId);
    if (existing) throw new ConflictError("conflict", "An encounter already exists for that appointment.");
    transition(db, actor, row, expectedVersion, "in-progress", "encounter-started");
    const id = `enc_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const now = new Date().toISOString();
    run(
      db,
      `INSERT INTO visit_encounters (id, organization_id, facility_id, patient_id, appointment_id, practitioner_id, status, started_at, created_by, version, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, 'in-progress', ?, ?, 1, ?, ?)`,
      id,
      actor.organizationId,
      actor.facilityId,
      row.patient_id,
      appointmentId,
      row.practitioner_id,
      now,
      actor.userId,
      now,
      now,
    );
    run(
      db,
      `INSERT INTO visit_encounter_events (id, encounter_id, organization_id, from_status, to_status, actor_id, reason, version, created_at)
       VALUES (?, ?, ?, 'none', 'in-progress', ?, 'started', 1, ?)`,
      randomUUID(),
      id,
      actor.organizationId,
      actor.userId,
      now,
    );
    writeAudit(db, sessionFor(db, actor), { action: "encounter.start", resourceType: "Encounter", resourceId: id, outcome: "success" });
    countMetric(db, "encounter.started");
    const response = { id, status: "in-progress", appointmentId, patientId: row.patient_id, practitionerId: row.practitioner_id };
    saveCommand(db, actor.organizationId, commandKey, response);
    return { ...response, idempotent: false };
  });
}

export function closeVisitEncounter(db: AppDatabase, actor: Actor, id: string, expectedVersion: number, reason: string) {
  gate(db, actor, "encounter.close");
  if (reason !== "visit-complete") throw new ValidationError("invalid", "The closure reason is not valid.");
  return transaction(db, () => {
    const row = get<{ id: string; organization_id: string; facility_id: string; appointment_id: string; status: string; version: number }>(db, `SELECT * FROM visit_encounters WHERE id = ?`, id);
    if (!row || row.organization_id !== actor.organizationId || row.facility_id !== actor.facilityId) throw new NotFoundError("That encounter is not available.");
    if (row.status !== "in-progress") throw new ConflictError("conflict", "That encounter cannot be closed.");
    if (row.version !== expectedVersion) throw new ConflictError("conflict", "The encounter changed.");
    const appointment = loadAppointment(db, actor, row.appointment_id);
    transition(db, actor, appointment, appointment.version, "closed", "encounter-closed");
    const now = new Date().toISOString();
    const changed = run(db, `UPDATE visit_encounters SET status = 'completed', ended_at = ?, closed_by = ?, closure_reason = ?, version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = 'in-progress'`, now, actor.userId, reason, now, id, expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The encounter changed.");
    run(
      db,
      `INSERT INTO visit_encounter_events (id, encounter_id, organization_id, from_status, to_status, actor_id, reason, version, created_at)
       VALUES (?, ?, ?, 'in-progress', 'completed', ?, ?, ?, ?)`,
      randomUUID(),
      id,
      actor.organizationId,
      actor.userId,
      reason,
      expectedVersion + 1,
      now,
    );
    writeAudit(db, sessionFor(db, actor), { action: "encounter.close", resourceType: "Encounter", resourceId: id, outcome: "success" });
    countMetric(db, "encounter.closed");
    return { id, status: "completed", version: expectedVersion + 1 };
  });
}

export function readVisitEncounter(db: AppDatabase, actor: Actor, id: string) {
  gate(db, actor, "encounter.read");
  const row = get<{ id: string; patient_id: string; practitioner_id: string; appointment_id: string; status: string; started_at: string | null; ended_at: string | null; version: number }>(
    db,
    `SELECT id, patient_id, practitioner_id, appointment_id, status, started_at, ended_at, version FROM visit_encounters WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    id,
    actor.organizationId,
    actor.facilityId,
  );
  if (!row) throw new NotFoundError("That encounter is not available.");
  const events = actorHas(db, actor, "encounter.history.read")
    ? all<{ from_status: string; to_status: string; actor_id: string; reason: string; version: number; created_at: string }>(
        db,
        `SELECT from_status, to_status, actor_id, reason, version, created_at FROM visit_encounter_events WHERE encounter_id = ? ORDER BY created_at`,
        id,
      )
    : [];
  writeAudit(db, sessionFor(db, actor), { action: "encounter.read", resourceType: "Encounter", resourceId: id, outcome: "success" });
  return { ...row, events };
}

function actorHas(db: AppDatabase, actor: Actor, permission: string) {
  return effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId).permissions.includes(permission);
}

export function queueAppointmentReminder(db: AppDatabase, actor: Actor, appointmentId: string) {
  gate(db, actor, "appointment.read");
  const row = loadAppointment(db, actor, appointmentId);
  const link = get<{ subject_id: string }>(db, `SELECT subject_id FROM patient_subject_links WHERE patient_id = ? AND organization_id = ? AND subject_kind = 'consent' AND status = 'verified'`, row.patient_id, actor.organizationId);
  if (!link) return { queued: false, reason: "no-subject-link" };
  const directive = get<{ status: string; version: number }>(
    db,
    `SELECT status, version FROM consent_directives WHERE organization_id = ? AND subject_id = ? AND action = 'consent.communication.dispatch' ORDER BY version DESC LIMIT 1`,
    actor.organizationId,
    link.subject_id,
  );
  if (directive?.status !== "active") return { queued: false, reason: directive?.status === "withdrawn" ? "consent-withdrawn" : "consent-missing" };
  run(
    db,
    `INSERT INTO scheduling_notices (id, organization_id, appointment_id, channel, status, created_at) VALUES (?, ?, ?, 'local-sandbox', 'queued', ?)`,
    randomUUID(),
    actor.organizationId,
    appointmentId,
    new Date().toISOString(),
  );
  return { queued: true, channel: "local-sandbox" };
}

export function schedulingSnapshot(input: { givenName?: string; reason?: string; contact?: string; traceId?: string }) {
  return sanitizeTelemetry(input);
}

export function setSchedulingDependency(db: AppDatabase, value: "available" | "unavailable") {
  run(db, `INSERT INTO scheduling_controls (name, value) VALUES ('dependency', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value`, value);
}

export function seedScheduling(db: AppDatabase) {
  if (!get(db, `SELECT id FROM organizations WHERE id = 'org_demo_gh'`)) return;
  run(db, `INSERT INTO scheduling_controls (name, value) VALUES ('dependency', 'available') ON CONFLICT(name) DO NOTHING`);
  const facilities = all<{ id: string; organization_id: string }>(db, `SELECT id, organization_id FROM facilities WHERE organization_id IN ('org_demo_gh', 'org_demo_eu')`);
  for (const facility of facilities) {
    run(
      db,
      `INSERT OR IGNORE INTO scheduling_resources (id, organization_id, facility_id, kind, name, capacity, status)
       VALUES (?, ?, ?, 'consultation-room', 'Consultation room', 1, 'active')`,
      `room_${facility.id}`,
      facility.organization_id,
      facility.id,
    );
  }
  const practitioners = all<{ id: string; organization_id: string; facility_id: string }>(
    db,
    `SELECT p.id, p.organization_id, a.facility_id FROM practitioners p
     JOIN practitioner_affiliations a ON a.practitioner_id = p.id AND a.status = 'active'
     WHERE p.status = 'active'`,
  );
  for (const practitioner of practitioners) {
    for (const day of [1, 2, 3, 4, 5]) {
      run(
        db,
        `INSERT OR IGNORE INTO practitioner_availability (id, practitioner_id, organization_id, facility_id, weekday, start_minute, end_minute)
         VALUES (?, ?, ?, ?, ?, 480, 720)`,
        `${practitioner.id}:${practitioner.facility_id}:${day}`,
        practitioner.id,
        practitioner.organization_id,
        practitioner.facility_id,
        day,
      );
    }
  }
  run(
    db,
    `INSERT OR IGNORE INTO retention_policies (
      id, organization_id, facility_id, jurisdiction, category, classification, trigger_event, duration, duration_unit,
      expiry_action, approval_state, status, version, effective_at, created_at, updated_at
    ) VALUES ('pol_syn_gh_schedule', 'org_demo_gh', NULL, 'SYNTHETIC_GH', 'appointment-encounter', 'synthetic', 'record-created', NULL, NULL, 'retain', 'pending_policy_approval', 'active', 1, '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z', '2026-01-15T00:00:00.000Z')`,
  );
}

export const SCHEDULE_ROLLBACK = `
DROP TABLE IF EXISTS scheduling_controls;
DROP TABLE IF EXISTS scheduling_metrics;
DROP TABLE IF EXISTS scheduling_notices;
DROP TABLE IF EXISTS schedule_commands;
DROP TABLE IF EXISTS visit_encounter_events;
DROP TABLE IF EXISTS visit_encounters;
DROP TABLE IF EXISTS appointment_events;
DROP TABLE IF EXISTS scheduling_reservations;
DROP TABLE IF EXISTS practitioner_availability;
DROP TABLE IF EXISTS scheduling_resources;
DELETE FROM schema_migrations WHERE version IN (39, 40, 41, 42, 43);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (38);
`;

export function assertVisitReadAccess(db:AppDatabase,actor:Actor){gate(db,actor,"encounter.read");}
