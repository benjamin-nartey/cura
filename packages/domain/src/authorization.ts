import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import type { AppDatabase } from "./db";
import { get, run, transaction } from "./db";
import { ConflictError, ForbiddenError } from "./errors";

const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID()}`;

export const POLICY_ID = "p02-rbac-2026.10";
export const POLICY_VERSION = 1;

let consentGate: ((
  db: AppDatabase,
  principalId: string,
  action: string,
  resource: AuthzResource,
  context: AuthzContext,
) => AuthzDecision | null) | null = null;

export function registerConsentGate(
  gate: (
    db: AppDatabase,
    principalId: string,
    action: string,
    resource: AuthzResource,
    context: AuthzContext,
  ) => AuthzDecision | null,
) {
  consentGate = gate;
}

const ROLES = [
  ["platform-administrator", "Platform administrator. Platform configuration only."],
  ["organization-administrator", "Organization administrator. No automatic clinical access."],
  ["facility-administrator", "Facility administrator within assigned facilities."],
  ["doctor", "Doctor. Proposed clinical access, not an approved clinical policy."],
  ["nurse", "Nurse. Proposed clinical access, not an approved clinical policy."],
  ["pharmacist", "Pharmacist. Proposed medication access, not an approved clinical policy."],
  ["laboratory-scientist", "Laboratory scientist. Proposed laboratory access, not an approved clinical policy."],
  ["receptionist", "Receptionist. Administrative functions only."],
  ["billing-officer", "Billing officer. Financial functions without clinical records."],
  ["patient", "Patient. Own administrative access only."],
  ["service-principal", "Service principal. Explicit machine capabilities only."],
  ["auditor", "Existing product auditor. Audit review without chart access."],
  ["privacy-officer", "Synthetic privacy officer. Consent and retention workflows only, not an approved clinical role."],
  ["records-manager", "Synthetic records manager. Retention execution only, not an approved clinical role."],
  ["legal-hold-admin", "Synthetic legal-hold administrator. Hold creation only, not an approved clinical role."],
  ["privacy-engineer", "Synthetic privacy engineer. Telemetry rule changes only, not an approved clinical role."],
] as const;

const PERMISSIONS: Array<[string, string, string, string]> = [
  ["organization.read", "organization", "read", "standard"],
  ["organization.manage", "organization", "manage", "administrative"],
  ["facility.read", "facility", "read", "standard"],
  ["facility.manage", "facility", "manage", "administrative"],
  ["facility.switch", "facility", "switch", "standard"],
  ["workforce.read", "workforce", "read", "administrative"],
  ["workforce.invite", "workforce", "invite", "administrative"],
  ["workforce.update", "workforce", "update", "administrative"],
  ["workforce.suspend", "workforce", "suspend", "administrative"],
  ["workforce.assign-role", "workforce", "assign-role", "administrative"],
  ["security.role.read", "security-role", "read", "administrative"],
  ["security.role.manage", "security-role", "manage", "restricted"],
  ["security.policy.read", "security-policy", "read", "administrative"],
  ["security.audit.read", "security-audit", "read", "administrative"],
  ["clinical.read", "clinical", "read", "clinical"],
  ["clinical.create", "clinical", "create", "clinical"],
  ["clinical.update", "clinical", "update", "clinical"],
  ["laboratory.order.read", "laboratory-order", "read", "clinical"],
  ["laboratory.result.read", "laboratory-result", "read", "clinical"],
  ["medication.read", "medication", "read", "clinical"],
  ["billing.read", "billing", "read", "administrative"],
  ["billing.create", "billing", "create", "administrative"],
  ["billing.catalog.read", "billing-catalog", "read", "administrative"],
  ["billing.catalog.manage", "billing-catalog", "manage", "administrative"],
  ["billing.charge.read", "billing-charge", "read", "administrative"],
  ["billing.charge.create", "billing-charge", "create", "administrative"],
  ["billing.charge.adjust", "billing-charge", "adjust", "administrative"],
  ["billing.charge.review", "billing-charge", "review", "administrative"],
  ["billing.charge.void", "billing-charge", "void", "administrative"],
  ["billing.charge.status", "billing-charge", "status", "administrative"],
  ["billing.history.read", "billing-history", "read", "administrative"],
  ["emergency.request", "emergency", "request", "administrative"],
  ["emergency.review.read", "emergency-review", "read", "administrative"],
  ["emergency.review.assign", "emergency-review", "assign", "administrative"],
  ["emergency.review.disposition", "emergency-review", "disposition", "administrative"],
  ["emergency.review.escalate", "emergency-review", "escalate", "administrative"],
  ["emergency.grant.revoke", "emergency-grant", "revoke", "administrative"],
  ["consent.read", "consent", "read", "administrative"],
  ["consent.record", "consent", "record", "administrative"],
  ["consent.verify", "consent", "verify", "administrative"],
  ["consent.manage", "consent", "manage", "administrative"],
  ["consent.withdraw", "consent", "withdraw", "administrative"],
  ["consent.history.read", "consent", "history", "administrative"],
  ["consent.policy.evaluate", "consent", "evaluate", "administrative"],
  ["consent.communication.dispatch", "consent-communication", "dispatch", "administrative"],
  ["consent.sharing.release", "consent-sharing", "release", "administrative"],
  ["consent.research.use", "consent-research", "use", "administrative"],
  ["retention.policy.read", "retention-policy", "read", "administrative"],
  ["retention.policy.manage", "retention-policy", "manage", "administrative"],
  ["retention.evaluate", "retention", "evaluate", "administrative"],
  ["retention.dry-run", "retention", "dry-run", "administrative"],
  ["retention.execute", "retention", "execute", "administrative"],
  ["retention.job.read", "retention-job", "read", "administrative"],
  ["legal-hold.read", "legal-hold", "read", "administrative"],
  ["legal-hold.create", "legal-hold", "create", "administrative"],
  ["legal-hold.activate", "legal-hold", "activate", "administrative"],
  ["legal-hold.release", "legal-hold", "release", "administrative"],
  ["retention.audit.read", "retention-audit", "read", "administrative"],
  ["privacy.request.read", "privacy-request", "read", "administrative"],
  ["privacy.request.create", "privacy-request", "create", "administrative"],
  ["privacy.request.verify", "privacy-request", "verify", "administrative"],
  ["privacy.request.approve", "privacy-request", "approve", "administrative"],
  ["privacy.bulk.approve", "privacy-request", "bulk-approve", "administrative"],
  ["privacy.export.run", "privacy-export", "run", "administrative"],
  ["privacy.export.download", "privacy-export", "download", "administrative"],
  ["privacy.export.revoke", "privacy-export", "revoke", "administrative"],
  ["privacy.audit.read", "privacy-audit", "read", "administrative"],
  ["privacy.telemetry.read", "privacy-telemetry", "read", "administrative"],
  ["privacy.alert.read", "privacy-alert", "read", "administrative"],
  ["privacy.alert.acknowledge", "privacy-alert", "acknowledge", "administrative"],
  ["privacy.alert.investigate", "privacy-alert", "investigate", "administrative"],
  ["privacy.rule.read", "privacy-rule", "read", "administrative"],
  ["privacy.rule.manage", "privacy-rule", "manage", "administrative"],
  ["privacy.telemetry.test", "privacy-telemetry", "test", "administrative"],
  ["patient.read", "patient", "read", "clinical"],
  ["patient.register", "patient", "register", "clinical"],
  ["patient.update", "patient", "update", "clinical"],
  ["patient.merge", "patient", "merge", "restricted"],
  ["practitioner.read", "practitioner", "read", "administrative"],
  ["practitioner.manage", "practitioner", "manage", "administrative"],
  ["practitioner.link", "practitioner", "link", "restricted"],
  ["appointment.read", "appointment", "read", "administrative"],
  ["appointment.create", "appointment", "create", "administrative"],
  ["appointment.confirm", "appointment", "confirm", "administrative"],
  ["appointment.reschedule", "appointment", "reschedule", "administrative"],
  ["appointment.cancel", "appointment", "cancel", "administrative"],
  ["appointment.arrive", "appointment", "arrive", "administrative"],
  ["appointment.no-show", "appointment", "no-show", "administrative"],
  ["encounter.read", "encounter", "read", "clinical"],
  ["encounter.start", "encounter", "start", "clinical"],
  ["encounter.close", "encounter", "close", "clinical"],
  ["encounter.history.read", "encounter", "history", "administrative"],
  ["clinical.condition.read", "clinical-condition", "read", "clinical"],
  ["clinical.condition.record", "clinical-condition", "record", "clinical"],
  ["clinical.condition.amend", "clinical-condition", "amend", "clinical"],
  ["clinical.allergy.read", "clinical-allergy", "read", "clinical"],
  ["clinical.allergy.record", "clinical-allergy", "record", "clinical"],
  ["clinical.allergy.amend", "clinical-allergy", "amend", "clinical"],
  ["clinical.observation.read", "clinical-observation", "read", "clinical"],
  ["clinical.observation.record", "clinical-observation", "record", "clinical"],
  ["clinical.observation.correct", "clinical-observation", "correct", "clinical"],
  ["clinical.medication-order.read", "clinical-medication-order", "read", "clinical"],
  ["clinical.medication-order.draft", "clinical-medication-order", "draft", "clinical"],
  ["clinical.medication-order.amend", "clinical-medication-order", "amend", "clinical"],
  ["clinical.medication-order.cancel", "clinical-medication-order", "cancel", "clinical"],
  ["clinical.source.history.read", "clinical-source", "history", "clinical"],
  ["work.order.read", "work-order", "read", "clinical"],
  ["work.order.submit", "work-order", "submit", "clinical"],
  ["work.order.route", "work-order", "route", "clinical"],
  ["work.order.cancel", "work-order", "cancel", "clinical"],
  ["work.plan.read", "work-plan", "read", "clinical"],
  ["work.plan.record", "work-plan", "record", "clinical"],
  ["work.plan.update", "work-plan", "update", "clinical"],
  ["work.referral.read", "work-referral", "read", "clinical"],
  ["work.referral.submit", "work-referral", "submit", "clinical"],
  ["work.referral.decide", "work-referral", "decide", "clinical"],
  ["work.referral.cancel", "work-referral", "cancel", "clinical"],
  ["work.task.read", "work-task", "read", "clinical"],
  ["work.task.assign", "work-task", "assign", "clinical"],
  ["work.attachment.add", "work-attachment", "add", "clinical"],
  ["work.pending.read", "work-queue", "read", "clinical"],
  ["work.history.read", "work-history", "read", "clinical"],
];

const GRANTS: Record<string, string[]> = {
  "platform-administrator": ["organization.read", "security.policy.read"],
  "organization-administrator": ["organization.read", "organization.manage", "facility.read", "facility.manage", "facility.switch", "workforce.read", "workforce.invite", "workforce.update", "workforce.suspend", "workforce.assign-role", "security.role.read", "security.role.manage", "security.policy.read", "patient.read", "patient.register", "patient.update", "patient.merge", "practitioner.read", "practitioner.manage", "practitioner.link"],
  "facility-administrator": ["facility.read", "facility.manage", "facility.switch", "workforce.read", "workforce.invite", "workforce.update", "workforce.assign-role", "security.role.read"],
  doctor: ["facility.read", "facility.switch", "clinical.read", "clinical.create", "clinical.update", "medication.read", "laboratory.order.read", "laboratory.result.read", "emergency.request", "patient.read", "patient.register", "practitioner.read", "appointment.read", "encounter.read", "encounter.start", "encounter.close", "encounter.history.read", "clinical.condition.read", "clinical.condition.record", "clinical.condition.amend", "clinical.allergy.read", "clinical.allergy.record", "clinical.allergy.amend", "clinical.observation.read", "clinical.observation.record", "clinical.observation.correct", "clinical.medication-order.read", "clinical.medication-order.draft", "clinical.medication-order.amend", "clinical.medication-order.cancel", "clinical.source.history.read", "work.order.read", "work.order.submit", "work.order.route", "work.order.cancel", "work.plan.read", "work.plan.record", "work.plan.update", "work.referral.read", "work.referral.submit", "work.referral.decide", "work.referral.cancel", "work.task.read", "work.task.assign", "work.attachment.add", "work.pending.read", "work.history.read", "billing.charge.status"],
  nurse: ["facility.read", "facility.switch", "clinical.read", "clinical.update", "medication.read", "patient.read", "practitioner.read", "appointment.read", "appointment.create", "appointment.confirm", "appointment.reschedule", "appointment.cancel", "appointment.arrive", "appointment.no-show", "encounter.read", "clinical.condition.read", "clinical.allergy.read", "clinical.observation.read", "clinical.medication-order.read", "clinical.source.history.read", "work.order.read", "work.plan.read", "work.referral.read", "work.task.read", "work.task.assign", "work.pending.read", "work.history.read"],
  pharmacist: ["facility.read", "medication.read"],
  "laboratory-scientist": ["facility.read", "laboratory.order.read", "laboratory.result.read", "work.order.read", "work.order.route", "work.referral.read", "work.referral.decide", "work.task.read", "work.task.assign", "work.pending.read", "work.history.read"],
  receptionist: ["facility.read", "facility.switch", "organization.read", "patient.read", "practitioner.read", "appointment.read", "appointment.create", "appointment.confirm", "appointment.reschedule", "appointment.cancel", "appointment.arrive", "appointment.no-show"],
  "billing-officer": ["facility.read", "facility.switch", "patient.read", "encounter.read", "billing.read", "billing.create", "billing.catalog.read", "billing.charge.read", "billing.charge.create", "billing.charge.adjust", "billing.charge.review", "billing.charge.void", "billing.history.read"],
  patient: ["organization.read"],
  "service-principal": ["organization.read"],
  auditor: ["organization.read", "facility.read", "security.audit.read", "security.policy.read", "emergency.review.read", "emergency.review.assign", "emergency.review.disposition", "emergency.review.escalate", "emergency.grant.revoke", "consent.read", "consent.history.read", "retention.policy.read", "retention.job.read", "legal-hold.read", "retention.audit.read", "privacy.request.read", "privacy.audit.read", "privacy.telemetry.read", "privacy.alert.read", "privacy.rule.read", "clinical.condition.read", "clinical.allergy.read", "clinical.observation.read", "clinical.medication-order.read", "clinical.source.history.read", "work.order.read", "work.plan.read", "work.referral.read", "work.task.read", "work.pending.read", "work.history.read", "billing.charge.read", "billing.catalog.read", "billing.history.read"],
  "privacy-officer": ["organization.read", "facility.read", "consent.read", "consent.record", "consent.verify", "consent.manage", "consent.withdraw", "consent.history.read", "consent.policy.evaluate", "consent.communication.dispatch", "consent.sharing.release", "consent.research.use", "retention.policy.read", "retention.policy.manage", "retention.evaluate", "retention.dry-run", "retention.job.read", "legal-hold.read", "legal-hold.release", "retention.audit.read", "privacy.request.read", "privacy.request.verify", "privacy.request.approve", "privacy.export.run", "privacy.export.revoke", "privacy.audit.read", "privacy.telemetry.read", "privacy.alert.read", "privacy.alert.acknowledge", "privacy.alert.investigate", "privacy.rule.read", "privacy.telemetry.test"],
  "records-manager": ["organization.read", "facility.read", "retention.policy.read", "retention.evaluate", "retention.dry-run", "retention.execute", "retention.job.read", "legal-hold.read", "privacy.request.read", "privacy.request.create", "privacy.export.download"],
  "legal-hold-admin": ["organization.read", "facility.read", "legal-hold.read", "legal-hold.create", "legal-hold.activate", "retention.policy.read", "retention.job.read", "privacy.request.read", "privacy.bulk.approve"],
  "privacy-engineer": ["organization.read", "privacy.telemetry.read", "privacy.rule.read", "privacy.rule.manage"],
};

const ROLE_FROM_MEMBERSHIP: Record<string, string> = {
  admin: "organization-administrator",
  "organization-administrator": "organization-administrator",
  clinician: "doctor",
  doctor: "doctor",
  nurse: "nurse",
  receptionist: "receptionist",
  laboratory: "laboratory-scientist",
  auditor: "auditor",
  "facility-administrator": "facility-administrator",
  "billing-officer": "billing-officer",
  billing: "billing-officer",
};

export type AuthzResource = {
  type: string;
  id?: string | null;
  organizationId?: string | null;
  facilityId?: string | null;
  sensitivity?: "standard" | "administrative" | "clinical" | "confidential" | "restricted" | null;
  relationship?: "required" | "assigned" | null;
};

export type AuthzContext = {
  purpose?: string | null;
  assurance?: string | null;
  sessionActive?: boolean;
  emergency?: boolean;
  relationshipAssigned?: boolean;
  activeFacilityId?: string | null;
  forwardedUserId?: string | null;
  bulk?: boolean;
  correlationId?: string | null;
  sessionId?: string | null;
};

export type AuthzDecision = {
  allow: boolean;
  reason: string;
  policyId: string;
  policyVersion: number;
};

const APPROVED_PURPOSES = new Set(["TREATMENT", "OPERATIONS", "PAYMENT", "ADMINISTRATION", "AUDIT", "PATIENT"]);

function ensureCache(db: AppDatabase) {
  const columns = db.prepare("PRAGMA table_info(authorization_cache)").all() as Array<{ name: string }>;
  if (columns.some((column) => column.name === "cache_key")) return;
  db.exec(`DROP TABLE IF EXISTS authorization_cache;
CREATE TABLE authorization_cache (
  cache_key TEXT PRIMARY KEY,
  assignment_version INTEGER NOT NULL,
  permissions_json TEXT NOT NULL
);`);
}

export function seedAuthorization(db: AppDatabase) {
  ensureCache(db);
  const now = new Date().toISOString();
  transaction(db, () => {
    for (const [id, description] of ROLES) {
      run(
        db,
        `INSERT INTO authorization_roles (id, organization_id, facility_id, name, description, system_role, status, version, created_at, updated_at)
         VALUES (?, 'system', NULL, ?, ?, 1, 'active', 1, ?, ?)
         ON CONFLICT(id) DO NOTHING`,
        id,
        id,
        description,
        now,
        now,
      );
    }
    for (const [id, resource, action, sensitivity] of PERMISSIONS) {
      run(
        db,
        `INSERT INTO authorization_permissions (id, resource, action, description, sensitivity, constraints_json)
         VALUES (?, ?, ?, ?, ?, '{}')
         ON CONFLICT(id) DO NOTHING`,
        id,
        resource,
        action,
        id,
        sensitivity,
      );
    }
    for (const [roleId, permissions] of Object.entries(GRANTS)) {
      for (const permissionId of permissions) {
        run(
          db,
          `INSERT INTO authorization_role_permissions (role_id, permission_id) VALUES (?, ?)
           ON CONFLICT(role_id, permission_id) DO NOTHING`,
          roleId,
          permissionId,
        );
      }
    }
    run(
      db,
      `DELETE FROM authorization_role_permissions
       WHERE role_id = 'organization-administrator' AND permission_id IN ('billing.read', 'security.audit.read')`,
    );
    run(
      db,
      `INSERT INTO authorization_policies (id, version, scope, conditions_json, effect, status, approved_at, effective_from, effective_until)
       VALUES (?, ?, 'platform', ?, 'deny', 'active', NULL, ?, NULL)
       ON CONFLICT(id, version) DO NOTHING`,
      POLICY_ID,
      POLICY_VERSION,
      JSON.stringify({
        denyOverrides: true,
        emergency: "disabled",
        unimplemented: ["clinical.sign", "medication.prescribe", "medication.dispense", "laboratory.result.authorize", "billing.adjust"],
        review: "Proposed clinical role permissions are not an approved clinical policy.",
      }),
      now,
    );
    run(db, `INSERT INTO authorization_controls (name, value) VALUES ('dependency', 'available') ON CONFLICT(name) DO NOTHING`);
    const memberships = db
      .prepare(
        `SELECT user_id, organization_id, facility_id, role FROM facility_memberships WHERE status = 'active'`,
      )
      .all() as Array<{ user_id: string; organization_id: string; facility_id: string; role: string }>;
    for (const row of memberships) {
      const roleId = ROLE_FROM_MEMBERSHIP[row.role];
      if (roleId) assignStored(db, row.user_id, roleId, row.organization_id, row.facility_id, "seed");
    }
    const users = db.prepare(`SELECT id, organization_id, role FROM users`).all() as Array<{
      id: string;
      organization_id: string;
      role: string;
    }>;
    for (const user of users) {
      const roleId = ROLE_FROM_MEMBERSHIP[user.role];
      if (!roleId) continue;
      const membership = get<{ status: string }>(
        db,
        `SELECT status FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
        user.id,
        user.organization_id,
      );
      if (membership && membership.status !== "active") continue;
      const facilityMember = get<{ id: string }>(
        db,
        `SELECT id FROM facility_memberships WHERE user_id = ? AND organization_id = ? LIMIT 1`,
        user.id,
        user.organization_id,
      );
      if (facilityMember) continue;
      const existing = get<{ id: string }>(
        db,
        `SELECT id FROM authorization_assignments WHERE principal_id = ? AND organization_id = ? LIMIT 1`,
        user.id,
        user.organization_id,
      );
      if (!existing) assignStored(db, user.id, roleId, user.organization_id, "", "seed");
    }
    if (get(db, `SELECT id FROM users WHERE id = 'usr_gh_privacy'`)) {
      assignStored(db, "usr_gh_privacy", "privacy-officer", "org_demo_gh", "fac_gh_accra", "seed");
    }
    if (get(db, `SELECT id FROM users WHERE id = 'usr_gh_records'`)) {
      assignStored(db, "usr_gh_records", "records-manager", "org_demo_gh", "fac_gh_accra", "seed");
    }
    if (get(db, `SELECT id FROM users WHERE id = 'usr_gh_legal'`)) {
      assignStored(db, "usr_gh_legal", "legal-hold-admin", "org_demo_gh", "fac_gh_accra", "seed");
    }
    const services = db
      .prepare(`SELECT id, organization_id FROM service_principals WHERE status = 'active'`)
      .all() as Array<{ id: string; organization_id: string }>;
    for (const service of services) assignStored(db, service.id, "service-principal", service.organization_id, "", "seed");
    run(
      db,
      `DELETE FROM authorization_assignments
       WHERE facility_id = ''
         AND EXISTS (
           SELECT 1 FROM facility_memberships m
           WHERE m.user_id = authorization_assignments.principal_id
             AND m.organization_id = authorization_assignments.organization_id
         )`,
    );
    run(db, `DELETE FROM authorization_cache`);
  });
}

function assignStored(db: AppDatabase, principalId: string, roleId: string, organizationId: string, facilityId: string, assignedBy: string) {
  run(
    db,
    `INSERT INTO authorization_assignments
      (id, principal_id, role_id, organization_id, facility_id, assigned_by, assigned_at, status, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', 1)
     ON CONFLICT(principal_id, role_id, organization_id, facility_id) DO NOTHING`,
    `asg_${principalId}_${roleId}_${facilityId || "org"}`,
    principalId,
    roleId,
    organizationId,
    facilityId,
    assignedBy,
    new Date().toISOString(),
  );
}

export function authorize(
  db: AppDatabase,
  subject: { principalId: string; accountActive?: boolean },
  action: string,
  resource: AuthzResource,
  context: AuthzContext,
): AuthzDecision {
  const started = Date.now();
  const correlationId = context.correlationId && /^[A-Za-z0-9_-]{8,80}$/.test(context.correlationId) ? context.correlationId : `az_${randomUUID()}`;
  let decision: AuthzDecision;
  try {
    const control = get<{ value: string }>(db, `SELECT value FROM authorization_controls WHERE name = 'dependency'`);
    const override = matchingDeny(db, subject.principalId, action);
    const account = get<{ account_status: string }>(db, `SELECT account_status FROM users WHERE id = ?`, subject.principalId);
    if (!control || control.value !== "available") {
      decision = deny("policy-unavailable");
    } else if (account?.account_status === "disabled") {
      decision = deny("account-disabled");
    } else if (context.emergency) {
      decision = deny("emergency-disabled");
    } else if (context.forwardedUserId && context.forwardedUserId !== subject.principalId) {
      decision = deny("delegation");
    } else if (subject.accountActive === false || context.sessionActive === false) {
      decision = deny("session-inactive");
    } else if (context.bulk || action.includes("*") || action.endsWith(".export") || action === "clinical.sign" || action === "billing.adjust" || action === "medication.prescribe" || action === "medication.dispense" || action === "laboratory.result.authorize") {
      decision = context.bulk || action.endsWith(".export") ? deny("bulk") : deny("unimplemented");
    } else if (!APPROVED_PURPOSES.has(context.purpose ?? "")) {
      decision = deny("purpose-denied");
    } else if (resource.sensitivity === "confidential" || resource.sensitivity === "restricted" || (resource.sensitivity == null && action.startsWith("clinical."))) {
      decision = resource.sensitivity == null ? deny("classification-missing") : deny("confidential");
    } else if (resource.relationship === "required" && !context.relationshipAssigned) {
      decision = deny("relationship-required");
    } else if (override) {
      decision = { allow: false, reason: "deny-override", policyId: override.id, policyVersion: override.version };
    } else {
      const membership = activeMembership(db, subject.principalId, resource.organizationId ?? null);
      if (resource.organizationId && !membership) decision = deny("tenant");
      else if (resource.facilityId && context.activeFacilityId && resource.facilityId !== context.activeFacilityId) decision = deny("facility");
      else if (resource.facilityId && !facilityMembership(db, subject.principalId, resource.facilityId)) decision = deny("facility");
      else if (!permitted(db, subject.principalId, action, resource.organizationId ?? null, resource.facilityId ?? null)) decision = deny("permission");
      else if (action === "security.role.manage" && context.assurance !== "mfa") decision = deny("assurance-required");
      else decision = { allow: true, reason: "permit", policyId: POLICY_ID, policyVersion: POLICY_VERSION };
    }
    if (!decision.allow && !context.emergency && (decision.reason === "relationship-required" || decision.reason === "permission") && emergencyGrantAllows(db, subject.principalId, action, resource, context)) {
      decision = { allow: true, reason: "emergency-grant", policyId: POLICY_ID, policyVersion: POLICY_VERSION };
      recordEmergencyUse(db, subject.principalId, action, resource, context);
    }
    if (decision.allow && consentGate) {
      const gated = consentGate(db, subject.principalId, action, resource, context);
      if (gated && !gated.allow) decision = gated;
    }
  } catch {
    decision = deny("policy-unavailable");
  }
  record(db, subject.principalId, action, resource.type, resource.organizationId && decision.reason !== "tenant" ? resource.organizationId : null, decision, correlationId, Date.now() - started);
  return decision;
}

function matchingDeny(db: AppDatabase, principalId: string, action: string) {
  const rows = db
    .prepare(`SELECT id, version, conditions_json FROM authorization_policies WHERE status = 'active' AND effect = 'deny'`)
    .all() as Array<{ id: string; version: number; conditions_json: string }>;
  for (const row of rows) {
    const conditions = JSON.parse(row.conditions_json) as { principalId?: string; action?: string };
    if (conditions.principalId === principalId && conditions.action === action) return row;
  }
  return null;
}

export function decisionStatus(decision: AuthzDecision, kind: "object" | "collection" = "collection") {
  if (decision.allow) return 200;
  if (decision.reason === "session-inactive") return 401;
  if (decision.reason === "tenant" && kind === "object") return 404;
  return 403;
}

function deny(reason: string): AuthzDecision {
  return { allow: false, reason, policyId: POLICY_ID, policyVersion: POLICY_VERSION };
}

function activeMembership(db: AppDatabase, principalId: string, organizationId: string | null) {
  if (!organizationId) return true;
  const membership = get<{ status: string }>(
    db,
    `SELECT status FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
    principalId,
    organizationId,
  );
  if (membership) return membership.status === "active";
  return Boolean(
    get(db, `SELECT id FROM service_principals WHERE id = ? AND organization_id = ? AND status = 'active'`, principalId, organizationId) ||
      get(db, `SELECT id FROM users WHERE id = ? AND organization_id = ?`, principalId, organizationId),
  );
}

function facilityMembership(db: AppDatabase, principalId: string, facilityId: string) {
  return Boolean(
    get(
      db,
      `SELECT id FROM facility_memberships WHERE user_id = ? AND facility_id = ? AND status = 'active'`,
      principalId,
      facilityId,
    ),
  );
}

function permitted(db: AppDatabase, principalId: string, action: string, organizationId: string | null, facilityId: string | null) {
  const version = Number(
    (get<{ version: number }>(db, `SELECT COALESCE(SUM(version), 0) AS version FROM authorization_assignments WHERE principal_id = ? AND status = 'active'`, principalId)?.version) ?? 0,
  );
  const cacheKey = `${principalId}|${organizationId ?? ""}|${facilityId ?? ""}`;
  const cached = get<{ assignment_version: number; permissions_json: string }>(db, `SELECT assignment_version, permissions_json FROM authorization_cache WHERE cache_key = ?`, cacheKey);
  let permissions: string[];
  if (cached && cached.assignment_version === version) permissions = JSON.parse(cached.permissions_json) as string[];
  else {
    const rows = db
      .prepare(
        `SELECT rp.permission_id AS permission
         FROM authorization_assignments a
         JOIN authorization_role_permissions rp ON rp.role_id = a.role_id
         WHERE a.principal_id = ? AND a.status = 'active'
           AND (? IS NULL OR a.organization_id = ?)
           AND (a.facility_id = '' OR a.facility_id IS NULL OR ? = '' OR a.facility_id = ?)`,
      )
      .all(principalId, organizationId, organizationId, facilityId ?? "", facilityId ?? "") as Array<{ permission: string }>;
    permissions = [...new Set(rows.map((row) => row.permission))];
    run(
      db,
      `INSERT INTO authorization_cache (cache_key, assignment_version, permissions_json) VALUES (?, ?, ?)
       ON CONFLICT(cache_key) DO UPDATE SET assignment_version = excluded.assignment_version, permissions_json = excluded.permissions_json`,
      cacheKey,
      version,
      JSON.stringify(permissions),
    );
  }
  return permissions.includes(action);
}

function record(
  db: AppDatabase,
  principalId: string,
  action: string,
  resourceType: string,
  organizationId: string | null,
  decision: AuthzDecision,
  correlationId: string,
  durationMs: number,
) {
  run(
    db,
    `INSERT INTO authorization_decisions
      (id, principal_id, action, resource_type, scope_organization_id, decision, reason, policy_id, policy_version, correlation_id, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `azd_${randomUUID()}`,
    principalId,
    action,
    resourceType,
    organizationId,
    decision.allow ? "allow" : "deny",
    decision.reason,
    decision.policyId,
    decision.policyVersion,
    correlationId,
    new Date().toISOString(),
  );
  const name = decision.allow ? "allow" : "deny";
  run(db, `INSERT INTO authorization_controls (name, value) VALUES (?, '1') ON CONFLICT(name) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`, name);
  run(db, `INSERT INTO authorization_controls (name, value) VALUES ('latency_ms', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, String(durationMs), String(durationMs));
  if (decision.reason === "tenant") run(db, `INSERT INTO authorization_controls (name, value) VALUES ('cross_tenant', '1') ON CONFLICT(name) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`);
  if (decision.reason === "permission" && action === "security.role.manage") {
    run(db, `INSERT INTO authorization_controls (name, value) VALUES ('escalation', '1') ON CONFLICT(name) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`);
  }
}

export function effectivePermissions(db: AppDatabase, principalId: string, organizationId: string, facilityId: string | null) {
  const organization = get<{ status: string }>(db, `SELECT status FROM organization_memberships WHERE user_id = ? AND organization_id = ?`, principalId, organizationId);
  if (organization && organization.status !== "active") {
    return { roles: [], permissions: [], version: 0, policyId: POLICY_ID, policyVersion: POLICY_VERSION, review: "This organization membership is not active." };
  }
  const facility = facilityId
    ? get<{ status: string }>(db, `SELECT status FROM facility_memberships WHERE user_id = ? AND facility_id = ?`, principalId, facilityId)
    : undefined;
  const rows = db
    .prepare(
      `SELECT a.role_id AS roleId, a.facility_id AS facilityId, a.version, rp.permission_id AS permission
       FROM authorization_assignments a
       JOIN authorization_role_permissions rp ON rp.role_id = a.role_id
       WHERE a.principal_id = ? AND a.organization_id = ? AND a.status = 'active'
         AND (a.facility_id = '' OR a.facility_id IS NULL OR a.facility_id = ?)`,
    )
    .all(principalId, organizationId, facilityId ?? "") as Array<{ roleId: string; facilityId: string; version: number; permission: string }>;
  const visible = facility && facility.status !== "active" ? rows.filter((row) => row.facilityId === "") : rows;
  const review = facility && facility.status !== "active"
    ? "This facility membership is not active."
    : "Proposed clinical permissions are not an approved clinical policy.";
  return {
    roles: [...new Set(visible.map((row) => row.roleId))],
    permissions: [...new Set(visible.map((row) => row.permission))].sort(),
    version: visible.reduce((sum, row) => sum + row.version, 0),
    policyId: POLICY_ID,
    policyVersion: POLICY_VERSION,
    review,
  };
}

export function assignRole(
  db: AppDatabase,
  actor: SessionContext,
  input: { principalId: string; roleId: string; facilityId?: string | null; expectedVersion: number },
) {
  if (actor.userId === input.principalId) throw new ForbiddenError("forbidden", "A person cannot assign a role to their own session.");
  const decision = authorize(
    db,
    { principalId: actor.userId, accountActive: true },
    "security.role.manage",
    { type: "RoleAssignment", organizationId: actor.organizationId, facilityId: actor.facilityId, sensitivity: "administrative" },
    { purpose: actor.purposeOfUse, assurance: "mfa", sessionActive: true },
  );
  if (!decision.allow) throw new ForbiddenError("forbidden", "Role assignment is not permitted.");
  const current = get<{ version: number }>(
    db,
    `SELECT version FROM authorization_assignments WHERE principal_id = ? AND role_id = ? AND organization_id = ? AND facility_id = ?`,
    input.principalId,
    input.roleId,
    actor.organizationId,
    input.facilityId ?? "",
  );
  if (current && current.version !== input.expectedVersion) throw new ConflictError("conflict", "The role assignment changed.");
  if (!current && input.expectedVersion !== 0) throw new ConflictError("conflict", "The role assignment changed.");
  const next = (current?.version ?? 0) + 1;
  run(
    db,
    `INSERT INTO authorization_assignments
      (id, principal_id, role_id, organization_id, facility_id, assigned_by, assigned_at, status, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
     ON CONFLICT(principal_id, role_id, organization_id, facility_id)
     DO UPDATE SET status = 'active', version = ?, assigned_by = ?, assigned_at = ?`,
    `asg_${input.principalId}_${input.roleId}_${input.facilityId || "org"}`,
    input.principalId,
    input.roleId,
    actor.organizationId,
    input.facilityId ?? "",
    actor.userId,
    new Date().toISOString(),
    next,
    next,
    actor.userId,
    new Date().toISOString(),
  );
  run(db, `DELETE FROM authorization_cache WHERE cache_key LIKE ?`, `${input.principalId}|%`);
}

export function revokeRole(db: AppDatabase, actorId: string, principalId: string, roleId: string, organizationId: string, facilityId = "") {
  const row = get<{ version: number }>(
    db,
    `SELECT version FROM authorization_assignments WHERE principal_id = ? AND role_id = ? AND organization_id = ? AND facility_id = ? AND status = 'active'`,
    principalId,
    roleId,
    organizationId,
    facilityId,
  );
  if (!row) return;
  run(
    db,
    `UPDATE authorization_assignments SET status = 'revoked', version = version + 1, assigned_by = ? WHERE principal_id = ? AND role_id = ? AND organization_id = ? AND facility_id = ? AND version = ?`,
    actorId,
    principalId,
    roleId,
    organizationId,
    facilityId,
    row.version,
  );
  run(db, `DELETE FROM authorization_cache WHERE cache_key LIKE ?`, `${principalId}|%`);
}

export function setAuthorizationDependency(db: AppDatabase, value: "available" | "unavailable") {
  run(db, `INSERT INTO authorization_controls (name, value) VALUES ('dependency', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, value, value);
}

export function authorizationCount(db: AppDatabase, name: string) {
  return Number(get<{ value: string }>(db, `SELECT value FROM authorization_controls WHERE name = ?`, name)?.value ?? 0);
}

function emergencyGrantAllows(db: AppDatabase, principalId: string, action: string, resource: AuthzResource, context: AuthzContext) {
  if (resource.type !== "SyntheticRestrictedRecord" || action !== "synthetic.read" || !context.sessionId || !resource.organizationId) return false;
  if (process.env.CURASPHERE_ENV === "production" || process.env.CURASPHERE_ENV === "staging") return false;
  const session = get<{ revoked_at: string | null }>(db, `SELECT revoked_at FROM auth_sessions WHERE session_id = ?`, context.sessionId);
  if (session?.revoked_at) return false;
  const membership = get<{ status: string }>(db, `SELECT status FROM organization_memberships WHERE user_id = ? AND organization_id = ?`, principalId, resource.organizationId);
  if (membership && membership.status !== "active") return false;
  const grant = get<{ id: string; expires_at: string; policy_version: number }>(
    db,
    `SELECT g.id, g.expires_at, g.policy_version FROM emergency_grants g
     JOIN emergency_policies p ON p.organization_id = g.organization_id AND p.facility_id = g.facility_id AND p.resource_type = g.resource_type AND p.action = g.action
     WHERE g.principal_id = ? AND g.session_id = ? AND g.organization_id = ? AND g.facility_id = ? AND g.resource_id = ? AND g.action = ?
       AND g.status = 'active' AND g.revoked_at IS NULL AND p.status = 'enabled' AND p.environment = 'development' AND p.version = g.policy_version`,
    principalId, context.sessionId, resource.organizationId, resource.facilityId ?? "", resource.id ?? "", action,
  );
  return Boolean(grant && Date.parse(grant.expires_at) > Date.now());
}

function recordEmergencyUse(db: AppDatabase, principalId: string, action: string, resource: AuthzResource, context: AuthzContext) {
  const grant = get<{ id: string; request_id: string; policy_version: number }>(
    db,
    `SELECT id, request_id, policy_version FROM emergency_grants WHERE principal_id = ? AND session_id = ? AND resource_id = ? AND status = 'active'`,
    principalId, context.sessionId ?? "", resource.id ?? "",
  );
  if (!grant) return;
  run(
    db,
    `INSERT INTO emergency_events (id, request_id, grant_id, actor_id, event_type, created_at, decision, resource_id, action, outcome, reason_code, policy_version, correlation_id)
     VALUES (?, ?, ?, ?, 'resource-accessed', ?, 'permit', ?, ?, 'allowed', 'emergency-grant', ?, ?)`,
    id("eem"), grant.request_id, grant.id, principalId, now(), resource.id ?? null, action, grant.policy_version, context.correlationId ?? id("cor"),
  );
}

export function latestDecision(db: AppDatabase, principalId: string) {
  return get<{ action: string; resource_type: string; decision: string; reason: string; policy_id: string; policy_version: number; scope_organization_id: string | null }>(
    db,
    `SELECT action, resource_type, decision, reason, policy_id, policy_version, scope_organization_id
     FROM authorization_decisions WHERE principal_id = ? ORDER BY created_at DESC LIMIT 1`,
    principalId,
  );
}
