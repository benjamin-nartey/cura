import type { SessionContext } from "@curasphere/contracts";
import { authorize, seedAuthorization } from "./authorization";
import { writeAudit } from "./audit";
import type { AppDatabase } from "./db";
import { get, run, transaction } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";

const HIDDEN = "That record is not available.";

export const DEMO_GH = {
  organizationId: "org_demo_gh",
  name: "DEMO_GH",
  facilities: {
    accra: { id: "fac_gh_accra", name: "Accra Central Medical Centre" },
    eastLegon: { id: "fac_gh_east_legon", name: "East Legon Family Clinic" },
    madina: { id: "fac_gh_madina", name: "Madina Diagnostic Centre" },
  },
  users: {
    admin: "usr_gh_admin",
    doctor: "usr_gh_doctor",
    nurse: "usr_gh_nurse",
    reception: "usr_gh_reception",
    laboratory: "usr_gh_lab",
  },
  servicePrincipalId: "svc_gh_sync",
} as const;

export const DEMO_EU = {
  organizationId: "org_demo_eu",
  name: "DEMO_EU",
  facilities: {
    northbridge: { id: "fac_eu_northbridge", name: "Northbridge General Hospital" },
    riverside: { id: "fac_eu_riverside", name: "Riverside Specialist Clinic" },
  },
  users: {
    admin: "usr_eu_admin",
    doctor: "usr_eu_doctor",
    nurse: "usr_eu_nurse",
  },
  servicePrincipalId: "svc_eu_sync",
} as const;

function assertAvailable(db: AppDatabase) {
  const row = get<{ dependency: string }>(db, "SELECT dependency FROM tenancy_controls WHERE id = 1");
  if (row?.dependency === "unavailable") {
    throw new ForbiddenError("unavailable", "The directory is temporarily unavailable.");
  }
}

export function setTenancyDependency(db: AppDatabase, dependency: "unavailable" | null) {
  if (dependency === null) {
    run(db, "DELETE FROM tenancy_controls WHERE id = 1");
    return;
  }
  run(
    db,
    `INSERT INTO tenancy_controls (id, dependency) VALUES (1, ?)
     ON CONFLICT(id) DO UPDATE SET dependency = excluded.dependency`,
    dependency,
  );
}

function backfill(db: AppDatabase) {
  const users = db
    .prepare(
      `SELECT id, organization_id, facility_id, role FROM users`,
    )
    .all() as Array<{ id: string; organization_id: string; facility_id: string | null; role: string }>;
  for (const user of users) {
    run(
      db,
      `INSERT INTO organization_memberships (id, organization_id, user_id, status, version)
       VALUES (?, ?, ?, 'active', 1)
       ON CONFLICT(organization_id, user_id) DO NOTHING`,
      `om_${user.organization_id}_${user.id}`,
      user.organization_id,
      user.id,
    );
    if (user.facility_id) {
      run(
        db,
        `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version)
         VALUES (?, ?, ?, ?, ?, 'active', 1)
         ON CONFLICT(facility_id, user_id) DO NOTHING`,
        `fm_${user.facility_id}_${user.id}`,
        user.organization_id,
        user.facility_id,
        user.id,
        user.role,
      );
    }
  }
}

function insertUser(db: AppDatabase, id: string, organizationId: string, facilityId: string | null, name: string, role: "admin" | "clinician" | "nurse") {
  run(
    db,
    `INSERT INTO users (id, organization_id, facility_id, display_name, role)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO NOTHING`,
    id,
    organizationId,
    facilityId,
    name,
    role,
  );
}

function insertOrg(db: AppDatabase, id: string, name: string) {
  run(db, `INSERT INTO organizations (id, name, jurisdiction, status) VALUES (?, ?, 'synthetic', 'active') ON CONFLICT(id) DO NOTHING`, id, name);
}

function insertFacility(db: AppDatabase, id: string, organizationId: string, name: string) {
  run(
    db,
    `INSERT INTO facilities (id, organization_id, name, timezone, status) VALUES (?, ?, ?, 'Africa/Accra', 'active') ON CONFLICT(id) DO NOTHING`,
    id,
    organizationId,
    name,
  );
}

function grant(db: AppDatabase, organizationId: string, facilityId: string, userId: string, role: string) {
  run(
    db,
    `INSERT INTO organization_memberships (id, organization_id, user_id, status, version)
     VALUES (?, ?, ?, 'active', 1)
     ON CONFLICT(organization_id, user_id) DO NOTHING`,
    `om_${organizationId}_${userId}`,
    organizationId,
    userId,
  );
  run(
    db,
    `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version)
     VALUES (?, ?, ?, ?, ?, 'active', 1)
     ON CONFLICT(facility_id, user_id) DO NOTHING`,
    `fm_${facilityId}_${userId}`,
    organizationId,
    facilityId,
    userId,
    role,
  );
}

export function seedDemoTenants(db: AppDatabase) {
  transaction(db, () => {
    insertOrg(db, DEMO_GH.organizationId, DEMO_GH.name);
    insertOrg(db, DEMO_EU.organizationId, DEMO_EU.name);
    for (const facility of Object.values(DEMO_GH.facilities)) insertFacility(db, facility.id, DEMO_GH.organizationId, facility.name);
    for (const facility of Object.values(DEMO_EU.facilities)) {
      run(
        db,
        `INSERT INTO facilities (id, organization_id, name, timezone, status) VALUES (?, ?, ?, 'Europe/London', 'active') ON CONFLICT(id) DO NOTHING`,
        facility.id,
        DEMO_EU.organizationId,
        facility.name,
      );
    }
    insertUser(db, DEMO_GH.users.admin, DEMO_GH.organizationId, DEMO_GH.facilities.accra.id, "Ama Mensah", "admin");
    insertUser(db, DEMO_GH.users.doctor, DEMO_GH.organizationId, DEMO_GH.facilities.accra.id, "Kwame Boateng", "clinician");
    insertUser(db, DEMO_GH.users.nurse, DEMO_GH.organizationId, DEMO_GH.facilities.accra.id, "Akosua Owusu", "nurse");
    insertUser(db, DEMO_GH.users.reception, DEMO_GH.organizationId, DEMO_GH.facilities.eastLegon.id, "Yaa Asare", "nurse");
    insertUser(db, DEMO_GH.users.laboratory, DEMO_GH.organizationId, DEMO_GH.facilities.madina.id, "Kojo Mensah", "clinician");
    insertUser(db, DEMO_EU.users.admin, DEMO_EU.organizationId, DEMO_EU.facilities.northbridge.id, "Elena Rossi", "admin");
    insertUser(db, DEMO_EU.users.doctor, DEMO_EU.organizationId, DEMO_EU.facilities.northbridge.id, "Mateo Rossi", "clinician");
    insertUser(db, DEMO_EU.users.nurse, DEMO_EU.organizationId, DEMO_EU.facilities.riverside.id, "Elena Costa", "nurse");
    grant(db, DEMO_GH.organizationId, DEMO_GH.facilities.accra.id, DEMO_GH.users.admin, "organization-administrator");
    grant(db, DEMO_GH.organizationId, DEMO_GH.facilities.accra.id, DEMO_GH.users.doctor, "doctor");
    grant(db, DEMO_GH.organizationId, DEMO_GH.facilities.accra.id, DEMO_GH.users.nurse, "nurse");
    grant(db, DEMO_GH.organizationId, DEMO_GH.facilities.eastLegon.id, DEMO_GH.users.nurse, "nurse");
    grant(db, DEMO_GH.organizationId, DEMO_GH.facilities.eastLegon.id, DEMO_GH.users.reception, "receptionist");
    grant(db, DEMO_GH.organizationId, DEMO_GH.facilities.madina.id, DEMO_GH.users.laboratory, "laboratory");
    grant(db, DEMO_EU.organizationId, DEMO_EU.facilities.northbridge.id, DEMO_EU.users.admin, "organization-administrator");
    grant(db, DEMO_EU.organizationId, DEMO_EU.facilities.northbridge.id, DEMO_EU.users.doctor, "doctor");
    grant(db, DEMO_EU.organizationId, DEMO_EU.facilities.riverside.id, DEMO_EU.users.nurse, "nurse");
    run(
      db,
      `INSERT INTO service_principals (id, organization_id, name, scope, status) VALUES (?, ?, 'directory-sync', 'organization:read', 'active')
       ON CONFLICT(id) DO NOTHING`,
      DEMO_GH.servicePrincipalId,
      DEMO_GH.organizationId,
    );
    run(
      db,
      `INSERT INTO service_principals (id, organization_id, name, scope, status) VALUES (?, ?, 'directory-sync', 'organization:read', 'active')
       ON CONFLICT(id) DO NOTHING`,
      DEMO_EU.servicePrincipalId,
      DEMO_EU.organizationId,
    );
    backfill(db);
  });
  seedAuthorization(db);
}

function audit(db: AppDatabase, ctx: SessionContext, action: string, resourceId: string | null, outcome: "success" | "denied" | "not_found" | "conflict") {
  writeAudit(db, ctx, { action, resourceType: "Tenancy", resourceId, outcome });
}

function sessionContext(db: AppDatabase, sessionId: string): SessionContext {
  const row = get<{
    user_id: string;
    display_name: string;
    role: SessionContext["role"];
    organization_id: string;
    organization_name: string;
    facility_id: string | null;
    facility_name: string | null;
  }>(
    db,
    `SELECT u.id AS user_id, u.display_name, u.role, u.organization_id, o.name AS organization_name,
            u.facility_id, f.name AS facility_name
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN facilities f ON f.id = u.facility_id
     WHERE s.id = ? AND s.revoked_at IS NULL`,
    sessionId,
  );
  if (!row) throw new NotFoundError(HIDDEN);
  const purpose = row.role === "admin" ? "OPERATIONS" : row.role === "auditor" ? "AUDIT" : "TREATMENT";
  return {
    sessionId,
    userId: row.user_id,
    displayName: row.display_name,
    role: row.role,
    purposeOfUse: purpose,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    facilityId: row.facility_id,
    facilityName: row.facility_name,
  };
}

export function bindTenancySession(db: AppDatabase, sessionId: string) {
  assertAvailable(db);
  backfill(db);
  const ctx = sessionContext(db, sessionId);
  const current = get<{ active_organization_id: string | null; context_version: number }>(
    db,
    "SELECT active_organization_id, context_version FROM sessions WHERE id = ?",
    sessionId,
  );
  if (!current?.active_organization_id) {
    run(
      db,
      `UPDATE sessions SET active_organization_id = ?, active_facility_id = ?, context_version = 1 WHERE id = ?`,
      ctx.organizationId,
      ctx.facilityId,
      sessionId,
    );
  }
  return readTenancy(db, sessionId);
}

export type TenancyView = {
  organizationId: string;
  organizationName: string;
  facilityId: string | null;
  facilityName: string | null;
  version: number;
  facilities: Array<{ id: string; name: string; role: string }>;
  organizations: Array<{ id: string; name: string }>;
  principals: Array<{ id: string; name: string; scope: string }>;
};

function readTenancy(db: AppDatabase, sessionId: string): TenancyView {
  const ctx = sessionContext(db, sessionId);
  const active = get<{ active_organization_id: string; active_facility_id: string | null; context_version: number }>(
    db,
    "SELECT active_organization_id, active_facility_id, context_version FROM sessions WHERE id = ?",
    sessionId,
  );
  if (!active?.active_organization_id) throw new NotFoundError(HIDDEN);
  const org = get<{ id: string; name: string; status: string }>(
    db,
    "SELECT id, name, status FROM organizations WHERE id = ?",
    active.active_organization_id,
  );
  if (!org || org.status !== "active") throw new ForbiddenError("closed", "This organization is not active.");
  const member = get<{ status: string }>(
    db,
    "SELECT status FROM organization_memberships WHERE organization_id = ? AND user_id = ?",
    org.id,
    ctx.userId,
  );
  if (member?.status !== "active") throw new NotFoundError(HIDDEN);
  const facilities = db
    .prepare(
      `SELECT f.id, f.name, m.role
       FROM facility_memberships m
       JOIN facilities f ON f.id = m.facility_id
       WHERE m.user_id = ? AND m.organization_id = ? AND m.status = 'active' AND f.status = 'active'
       ORDER BY f.name`,
    )
    .all(ctx.userId, org.id) as Array<{ id: string; name: string; role: string }>;
  const organizations = db
    .prepare(
      `SELECT o.id, o.name
       FROM organization_memberships m
       JOIN organizations o ON o.id = m.organization_id
       WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active'
       ORDER BY o.name`,
    )
    .all(ctx.userId) as Array<{ id: string; name: string }>;
  const facility = facilities.find((item) => item.id === active.active_facility_id) ?? null;
  const principals = db
    .prepare(
      `SELECT id, name, scope FROM service_principals
       WHERE organization_id = ? AND status = 'active'
       ORDER BY name`,
    )
    .all(org.id) as Array<{ id: string; name: string; scope: string }>;
  return {
    organizationId: org.id,
    organizationName: org.name,
    facilityId: facility?.id ?? null,
    facilityName: facility?.name ?? null,
    version: active.context_version,
    facilities,
    organizations,
    principals,
  };
}

export function listTenancy(db: AppDatabase, sessionId: string, headers: Headers) {
  assertAvailable(db);
  const view = bindTenancySession(db, sessionId);
  const claimed = headers.get("x-organization-id");
  if (claimed && claimed !== view.organizationId) {
    audit(db, sessionContext(db, sessionId), "tenancy.header", null, "denied");
    throw new ForbiddenError("tenant", HIDDEN);
  }
  return view;
}

export function readTenantOrganization(db: AppDatabase, sessionId: string, organizationId: string) {
  assertAvailable(db);
  const view = bindTenancySession(db, sessionId);
  const ctx = sessionContext(db, sessionId);
  if (!organizationId.trim()) throw new ValidationError("invalid", "Choose an organization.");
  const visible = view.organizations.some((org) => org.id === organizationId);
  if (!visible) {
    audit(db, ctx, "tenancy.read", null, "not_found");
    throw new NotFoundError(HIDDEN);
  }
  audit(db, ctx, "tenancy.read", organizationId, "success");
  return view.organizations.find((org) => org.id === organizationId) ?? null;
}

export function switchFacility(db: AppDatabase, sessionId: string, facilityId: string, expectedVersion: number) {
  assertAvailable(db);
  if (!facilityId.trim()) throw new ValidationError("invalid", "Choose a facility.");
  const view = bindTenancySession(db, sessionId);
  const ctx = sessionContext(db, sessionId);
  if (view.version !== expectedVersion) {
    audit(db, ctx, "tenancy.switch", null, "conflict");
    throw new ConflictError("conflict", "The facility context changed. Refresh and try again.");
  }
  const allowed = view.facilities.some((facility) => facility.id === facilityId);
  if (!allowed) {
    audit(db, ctx, "tenancy.switch", null, "not_found");
    throw new NotFoundError(HIDDEN);
  }
  const decision = authorize(
    db,
    { principalId: ctx.userId, accountActive: true },
    "facility.switch",
    { type: "Facility", organizationId: ctx.organizationId, facilityId, sensitivity: "standard" },
    { purpose: ctx.purposeOfUse, assurance: "directory", sessionActive: true },
  );
  if (!decision.allow) throw new ForbiddenError("forbidden", "Facility access is not available.");
  if (view.facilityId === facilityId) return view;
  const nextVersion = view.version + 1;
  const updated = db
    .prepare(
      `UPDATE sessions SET active_facility_id = ?, context_version = ?
       WHERE id = ? AND context_version = ?`,
    )
    .run(facilityId, nextVersion, sessionId, expectedVersion);
  if (updated.changes !== 1) {
    audit(db, ctx, "tenancy.switch", null, "conflict");
    throw new ConflictError("conflict", "The facility context changed. Refresh and try again.");
  }
  audit(db, ctx, "tenancy.switch", facilityId, "success");
  return readTenancy(db, sessionId);
}

export function readServicePrincipal(db: AppDatabase, sessionId: string, principalId: string) {
  assertAvailable(db);
  const view = bindTenancySession(db, sessionId);
  const ctx = sessionContext(db, sessionId);
  const row = get<{ id: string; name: string; scope: string; organization_id: string; status: string }>(
    db,
    "SELECT id, name, scope, organization_id, status FROM service_principals WHERE id = ?",
    principalId,
  );
  if (!row || row.organization_id !== view.organizationId || row.status !== "active") {
    audit(db, ctx, "tenancy.principal", null, "not_found");
    throw new NotFoundError(HIDDEN);
  }
  return { id: row.id, name: row.name, scope: row.scope };
}

export function disableOrganization(db: AppDatabase, organizationId: string) {
  run(db, "UPDATE organizations SET status = 'disabled' WHERE id = ?", organizationId);
}

export function mirrorTenancySession(db: AppDatabase, sessionId: string, userId: string) {
  const user = get<{ id: string }>(db, "SELECT id FROM users WHERE id = ?", userId);
  if (!user) throw new NotFoundError(HIDDEN);
  const existing = get<{ id: string }>(db, "SELECT id FROM sessions WHERE id = ?", sessionId);
  if (existing) return;
  const now = new Date();
  const expires = new Date(now.getTime() + 12 * 60 * 60 * 1000).toISOString();
  run(
    db,
    `INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)`,
    sessionId,
    userId,
    now.toISOString(),
    expires,
  );
}
