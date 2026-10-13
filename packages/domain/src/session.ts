import { randomUUID } from "node:crypto";
import type { PurposeOfUse, Role, SessionContext } from "@curasphere/contracts";
import type { AppDatabase } from "./db";
import { get, run } from "./db";
import { ForbiddenError, NotFoundError } from "./errors";

const SESSION_HOURS = 12;

type UserRow = {
  id: string;
  organization_id: string;
  facility_id: string | null;
  display_name: string;
  role: Role;
  organization_name: string;
  facility_name: string | null;
};

function purposeFor(role: Role): PurposeOfUse {
  if (role === "auditor") return "AUDIT";
  if (role === "admin") return "OPERATIONS";
  return "TREATMENT";
}

export function assertDevDirectory() {
  if (process.env.CURASPHERE_ENV === "production") {
    throw new ForbiddenError("disabled", "Local directory sign-in is disabled.");
  }
}

export function canReadChart(ctx: SessionContext) {
  return (ctx.role === "clinician" || ctx.role === "nurse" || ctx.role === "admin") && Boolean(ctx.facilityId);
}

export function canRegisterPatient(ctx: SessionContext) {
  return (ctx.role === "clinician" || ctx.role === "admin") && Boolean(ctx.facilityId);
}

export function canReviewAudit(ctx: SessionContext) {
  return ctx.role === "auditor" || ctx.role === "admin";
}

function loadUser(db: AppDatabase, userId: string) {
  return get<UserRow>(
    db,
    `SELECT u.id, u.organization_id, u.facility_id, u.display_name, u.role,
            o.name AS organization_name, f.name AS facility_name
     FROM users u
     JOIN organizations o ON o.id = u.organization_id
     LEFT JOIN facilities f ON f.id = u.facility_id
     WHERE u.id = ?`,
    userId,
  );
}

function toContext(sessionId: string, user: UserRow): SessionContext {
  return {
    sessionId,
    userId: user.id,
    displayName: user.display_name,
    role: user.role,
    purposeOfUse: purposeFor(user.role),
    organizationId: user.organization_id,
    organizationName: user.organization_name,
    facilityId: user.facility_id,
    facilityName: user.facility_name,
  };
}

export function listDirectory(db: AppDatabase) {
  assertDevDirectory();
  const rows = db
    .prepare(
      `SELECT u.id, u.display_name, u.role, u.organization_id, o.name AS organization_name,
              u.facility_id, f.name AS facility_name
       FROM users u
       JOIN organizations o ON o.id = u.organization_id
       LEFT JOIN facilities f ON f.id = u.facility_id
       ORDER BY o.name, f.name, u.display_name`,
    )
    .all() as {
    id: string;
    display_name: string;
    role: Role;
    organization_id: string;
    organization_name: string;
    facility_id: string | null;
    facility_name: string | null;
  }[];
  return rows.map((row) => ({
    userId: row.id,
    displayName: row.display_name,
    role: row.role,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    facilityId: row.facility_id,
    facilityName: row.facility_name,
  }));
}

export function openSession(db: AppDatabase, userId: string) {
  assertDevDirectory();
  const user = loadUser(db, userId);
  if (!user) throw new NotFoundError("That directory entry does not exist.");
  const now = new Date();
  const sessionId = randomUUID();
  const expires = new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000).toISOString();
  run(
    db,
    `INSERT INTO sessions (id, user_id, created_at, expires_at, revoked_at) VALUES (?, ?, ?, ?, NULL)`,
    sessionId,
    user.id,
    now.toISOString(),
    expires,
  );
  const ctx = toContext(sessionId, user);
  writeAuditStandalone(db, ctx, "session.opened", "Session", sessionId, "success");
  return { sessionId, expiresAt: expires };
}

export function readSession(db: AppDatabase, sessionId: string): SessionContext | null {
  const row = get<{ user_id: string; expires_at: string }>(
    db,
    `SELECT user_id, expires_at FROM sessions WHERE id = ? AND revoked_at IS NULL`,
    sessionId,
  );
  if (!row) return null;
  if (Date.parse(row.expires_at) <= Date.now()) return null;
  const user = loadUser(db, row.user_id);
  if (!user) return null;
  return toContext(sessionId, user);
}

export function closeSession(db: AppDatabase, sessionId: string) {
  const ctx = readSession(db, sessionId);
  run(db, `UPDATE sessions SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`, new Date().toISOString(), sessionId);
  if (ctx) writeAuditStandalone(db, ctx, "session.closed", "Session", sessionId, "success");
}

function writeAuditStandalone(
  db: AppDatabase,
  ctx: SessionContext,
  action: string,
  resourceType: string,
  resourceId: string | null,
  outcome: string,
) {
  run(
    db,
    `INSERT INTO audit_events (id, organization_id, actor_id, purpose_of_use, action, resource_type, resource_id, outcome, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    ctx.organizationId,
    ctx.userId,
    ctx.purposeOfUse,
    action,
    resourceType,
    resourceId,
    outcome,
    new Date().toISOString(),
  );
}
