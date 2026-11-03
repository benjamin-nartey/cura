import { effectivePermissions } from "./authorization";
import { chargeStatus, listCharges } from "./billing";
import { listAllergies, listConditions, listMedicationOrders, listObservations, listPatientEncounters, sourceHistory } from "./clinical-source";
import type { AppDatabase } from "./db";
import { ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { assertLocalHealthcareSandbox } from "./experimental-healthcare";
import { readMasterPatient } from "./master-records";
import { listAppointments, readVisitEncounter } from "./scheduling";
import { listOrders, listPending, listPlans, listReferrals } from "./work";

export type ChartActor = { userId: string; organizationId: string; facilityId: string | null; sessionId: string };

export function readUnifiedChart(db: AppDatabase, actor: ChartActor, patientId: string, encounterId?: string) {
  assertLocalHealthcareSandbox();
  if (!actor.facilityId || !actor.sessionId) throw new ForbiddenError();
  const access = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId);
  if (!access.permissions.includes("patient.read") && !access.permissions.includes("clinical.read")) throw new ForbiddenError();
  let patient;
  try {
    patient = readMasterPatient(db, actor, patientId);
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof ValidationError || error instanceof ForbiddenError) throw error;
    throw new NotFoundError("That patient is not available.");
  }
  if (patient.registration_status === "merged") {
    return {
      patient,
      superseded: true,
      survivorId: patient.merged_into_id,
      sections: {} as Record<string, unknown>,
      permissions: access.permissions,
      notice: "That patient is superseded. Open the surviving record.",
    };
  }
  const can = (permission: string) => access.permissions.includes(permission);
  const sections: Record<string, unknown> = {};
  const failures: string[] = [];
  const load = (name: string, permission: string | null, fn: () => unknown) => {
    if (permission && !can(permission)) {
      sections[name] = { denied: true };
      return;
    }
    try {
      sections[name] = fn();
    } catch {
      failures.push(name);
      sections[name] = { failed: true };
    }
  };
  load("conditions", "clinical.condition.read", () => listConditions(db, actor, patientId));
  load("allergies", "clinical.allergy.read", () => listAllergies(db, actor, patientId));
  load("observations", "clinical.observation.read", () => listObservations(db, actor, patientId));
  load("medications", "clinical.medication-order.read", () => listMedicationOrders(db, actor, patientId));
  load("encounters", "encounter.read", () => listPatientEncounters(db, actor, patientId));
  load("orders", "work.order.read", () => listOrders(db, actor, patientId));
  load("plans", "work.plan.read", () => listPlans(db, actor, patientId));
  load("referrals", "work.referral.read", () => listReferrals(db, actor, patientId));
  load("pending", "work.pending.read", () => listPending(db, actor, patientId));
  load("appointments", "appointment.read", () => listAppointments(db, actor).filter((row) => row.patient_id === patientId));
  if (can("billing.charge.read")) load("charges", "billing.charge.read", () => listCharges(db, actor, patientId));
  else if (can("billing.charge.status")) load("billingStatus", "billing.charge.status", () => chargeStatus(db, actor, patientId));
  else sections.billingStatus = { denied: true };
  let encounter = null;
  if (encounterId && can("encounter.read")) {
    try {
      encounter = readVisitEncounter(db, actor, encounterId);
      if (encounter.patient_id !== patientId) encounter = null;
    } catch {
      failures.push("encounter");
    }
  }
  return {
    patient,
    encounter,
    superseded: false,
    sections,
    failures,
    permissions: access.permissions,
    notice: "Source records stay authoritative. Missing sections are empty, not normal findings.",
  };
}

export function readUnifiedSourceHistory(db: AppDatabase, actor: ChartActor, kind: string, id: string) {
  if (!actor.facilityId) throw new ForbiddenError();
  const access = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId);
  if (!access.permissions.includes("clinical.source.history.read")) throw new ForbiddenError();
  return sourceHistory(db, actor, kind, id);
}
