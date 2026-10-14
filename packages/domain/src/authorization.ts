import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import type { AppDatabase } from "./db";
import { get, run, transaction } from "./db";
import { ConflictError, ForbiddenError } from "./errors";

export const POLICY_ID = "p02-rbac-2026.10";
export const POLICY_VERSION = 1;

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
] as const;

const PERMISSIONS: Array<[string, string, string, string]> = [
  ["organization.read", "organization", "read", "standard"],
  ["organization.manage", "organization", "manage", "administrative"],
  ["facility.read", "facility", "read", "standard"],
  ["facility.manage", "facility", "manage", "administrative"],
  ["facility.switch", "facility", "switch", "standard"],
  ["workforce.read", "workforce", "read", "administrative"],
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
];

const GRANTS: Record<string, string[]> = {
  "platform-administrator": ["organization.read", "security.policy.read"],
  "organization-administrator": ["organization.read", "organization.manage", "facility.read", "facility.manage", "facility.switch", "workforce.read", "security.role.read", "security.role.manage", "security.policy.read", "security.audit.read", "billing.read"],
  "facility-administrator": ["facility.read", "facility.manage", "facility.switch", "workforce.read", "security.role.read"],
  doctor: ["facility.read", "facility.switch", "clinical.read", "clinical.create", "clinical.update", "medication.read", "laboratory.order.read", "laboratory.result.read"],
  nurse: ["facility.read", "facility.switch", "clinical.read", "clinical.update", "medication.read"],
  pharmacist: ["facility.read", "medication.read"],
  "laboratory-scientist": ["facility.read", "laboratory.order.read", "laboratory.result.read"],
  receptionist: ["facility.read", "facility.switch", "organization.read"],
  "billing-officer": ["facility.read", "billing.read", "billing.create"],
  patient: ["organization.read"],
  "service-principal": ["organization.read"],
  auditor: ["organization.read", "facility.read", "security.audit.read", "security.policy.read"],
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
};

export type AuthzResource = {
  type: string;
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
      `INSERT INTO authorization_policies (id, version, scope, conditions_json, effect, status, approved_at, effective_from, effective_until)
       VALUES (?, ?, 'platform', ?, 'deny', 'active', NULL, ?, NULL)
       ON CONFLICT(id, version) DO NOTHING`,
      POLICY_ID,
      POLICY_VERSION,
      JSON.stringify({
        denyOverrides: true,
        emergency: "disabled",
        unimplemented: ["clinical.sign", "medication.prescribe", "medication.dispense", "laboratory.result.authorize", "billing.adjust", "workforce.invite"],
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
    if (!control || control.value !== "available") {
      decision = deny("policy-unavailable");
    } else if (context.emergency) {
      decision = deny("emergency-disabled");
    } else if (context.forwardedUserId && context.forwardedUserId !== subject.principalId) {
      decision = deny("delegation");
    } else if (subject.accountActive === false || context.sessionActive === false) {
      decision = deny("session-inactive");
    } else if (context.bulk || action.includes("*") || action.endsWith(".export") || action === "clinical.sign" || action === "billing.adjust" || action === "medication.prescribe" || action === "medication.dispense" || action === "laboratory.result.authorize" || action === "workforce.invite") {
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
  return Boolean(
    get(
      db,
      `SELECT id FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'
       UNION SELECT id FROM service_principals WHERE id = ? AND organization_id = ? AND status = 'active'`,
      principalId,
      organizationId,
      principalId,
      organizationId,
    ) ||
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
  const rows = db
    .prepare(
      `SELECT a.role_id AS roleId, a.facility_id AS facilityId, a.version, rp.permission_id AS permission
       FROM authorization_assignments a
       JOIN authorization_role_permissions rp ON rp.role_id = a.role_id
       WHERE a.principal_id = ? AND a.organization_id = ? AND a.status = 'active'
         AND (a.facility_id = '' OR a.facility_id IS NULL OR a.facility_id = ?)`,
    )
    .all(principalId, organizationId, facilityId ?? "") as Array<{ roleId: string; facilityId: string; version: number; permission: string }>;
  return {
    roles: [...new Set(rows.map((row) => row.roleId))],
    permissions: [...new Set(rows.map((row) => row.permission))].sort(),
    version: rows.reduce((sum, row) => sum + row.version, 0),
    policyId: POLICY_ID,
    policyVersion: POLICY_VERSION,
    review: "Proposed clinical permissions are not an approved clinical policy.",
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

export function latestDecision(db: AppDatabase, principalId: string) {
  return get<{ action: string; resource_type: string; decision: string; reason: string; policy_id: string; policy_version: number; scope_organization_id: string | null }>(
    db,
    `SELECT action, resource_type, decision, reason, policy_id, policy_version, scope_organization_id
     FROM authorization_decisions WHERE principal_id = ? ORDER BY created_at DESC LIMIT 1`,
    principalId,
  );
}
