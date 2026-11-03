import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { POLICY_ID, POLICY_VERSION, authorize } from "./authorization";
import type { AppDatabase } from "./db";
import { get, run, transaction } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { revokeUserSessions } from "./identity";

const HIDDEN = "That record is not available.";
const PRIVILEGED = new Set(["platform-administrator", "organization-administrator", "facility-administrator"]);
const DAY = 7 * 24 * 60 * 60 * 1000;

export type WorkforceActor = {
  userId: string;
  organizationId: string;
  facilityId: string | null;
  purpose: string;
  assurance: string;
};

function actorFrom(ctx: SessionContext, assurance = "directory"): WorkforceActor {
  return { userId: ctx.userId, organizationId: ctx.organizationId, facilityId: ctx.facilityId, purpose: ctx.purposeOfUse, assurance };
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function correlation() {
  return `wf_${randomUUID()}`;
}

function event(
  db: AppDatabase,
  actorId: string,
  targetId: string,
  action: string,
  organizationId: string | null,
  previousState: string | null,
  nextState: string | null,
  reason: string,
  correlationId: string,
) {
  run(
    db,
    `INSERT INTO workforce_events
      (id, actor_id, target_id, action, organization_id, previous_state, next_state, reason, correlation_id, policy_id, policy_version, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    `wfe_${randomUUID()}`,
    actorId,
    targetId,
    action,
    organizationId,
    previousState,
    nextState,
    reason.slice(0, 200),
    correlationId,
    POLICY_ID,
    POLICY_VERSION,
    new Date().toISOString(),
  );
}

function permit(db: AppDatabase, actor: WorkforceActor, action: string) {
  const decision = authorize(
    db,
    { principalId: actor.userId, accountActive: true },
    action,
    { type: "Workforce", organizationId: actor.organizationId, sensitivity: "administrative" },
    { purpose: actor.purpose, assurance: actor.assurance, sessionActive: true, activeFacilityId: actor.facilityId },
  );
  if (!decision.allow) throw new ForbiddenError("forbidden", "Workforce administration is not available.");
  return decision;
}

function sameOrg(actor: WorkforceActor, organizationId: string) {
  if (organizationId !== actor.organizationId) throw new NotFoundError(HIDDEN);
}

function facilityInOrg(db: AppDatabase, organizationId: string, facilityId: string) {
  const row = get<{ status: string }>(db, `SELECT status FROM facilities WHERE id = ? AND organization_id = ?`, facilityId, organizationId);
  if (!row || row.status !== "active") throw new NotFoundError(HIDDEN);
}

function actorFacilities(db: AppDatabase, actor: WorkforceActor) {
  const orgWide = Boolean(
    get(
      db,
      `SELECT id FROM authorization_assignments WHERE principal_id = ? AND organization_id = ? AND role_id = 'organization-administrator' AND status = 'active'`,
      actor.userId,
      actor.organizationId,
    ),
  );
  if (orgWide) {
    return db.prepare(`SELECT id FROM facilities WHERE organization_id = ? AND status = 'active'`).all(actor.organizationId) as Array<{ id: string }>;
  }
  return db
    .prepare(`SELECT facility_id AS id FROM facility_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`)
    .all(actor.userId, actor.organizationId) as Array<{ id: string }>;
}

function assertFacilityScope(db: AppDatabase, actor: WorkforceActor, facilityId: string) {
  facilityInOrg(db, actor.organizationId, facilityId);
  if (!actorFacilities(db, actor).some((row) => row.id === facilityId)) throw new NotFoundError(HIDDEN);
}

function lastOrganizationAdministrator(db: AppDatabase, organizationId: string, exceptUserId?: string) {
  const rows = db
    .prepare(
      `SELECT principal_id FROM authorization_assignments
       WHERE organization_id = ? AND role_id = 'organization-administrator' AND status = 'active'`,
    )
    .all(organizationId) as Array<{ principal_id: string }>;
  const remaining = new Set(rows.map((row) => row.principal_id));
  if (exceptUserId) remaining.delete(exceptUserId);
  return remaining.size === 0 && rows.some((row) => row.principal_id === exceptUserId);
}

function clearCache(db: AppDatabase, principalId: string) {
  run(db, `DELETE FROM authorization_cache WHERE cache_key LIKE ?`, `${principalId}|%`);
}

function putAssignment(db: AppDatabase, principalId: string, roleId: string, organizationId: string, facilityId: string, actorId: string) {
  const current = get<{ version: number; status: string }>(
    db,
    `SELECT version, status FROM authorization_assignments WHERE principal_id = ? AND role_id = ? AND organization_id = ? AND facility_id = ?`,
    principalId,
    roleId,
    organizationId,
    facilityId,
  );
  const next = (current?.version ?? 0) + 1;
  run(
    db,
    `INSERT INTO authorization_assignments
      (id, principal_id, role_id, organization_id, facility_id, assigned_by, assigned_at, status, version)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?)
     ON CONFLICT(principal_id, role_id, organization_id, facility_id)
     DO UPDATE SET status = 'active', version = ?, assigned_by = ?, assigned_at = ?`,
    `asg_${principalId}_${roleId}_${facilityId || "org"}`,
    principalId,
    roleId,
    organizationId,
    facilityId,
    actorId,
    new Date().toISOString(),
    next,
    next,
    actorId,
    new Date().toISOString(),
  );
  clearCache(db, principalId);
}

export function listWorkforce(db: AppDatabase, actor: WorkforceActor, query: { q?: string; facilityId?: string; role?: string; status?: string; offset?: number }) {
  permit(db, actor, "workforce.read");
  const facilities = actorFacilities(db, actor).map((row) => row.id);
  if (query.facilityId && !facilities.includes(query.facilityId)) throw new NotFoundError(HIDDEN);
  const scoped = query.facilityId ? [query.facilityId] : facilities;
  if (scoped.length === 0) return { total: 0, pendingInvitations: 0, suspended: 0, active: 0, staff: [] };
  const like = `%${(query.q ?? "").replace(/[%_]/g, "")}%`;
  const status = query.status && ["active", "suspended", "revoked"].includes(query.status) ? query.status : "";
  const role = query.role && /^[a-z-]+$/.test(query.role) ? query.role : "";
  const rows = db
    .prepare(
      `SELECT u.id, u.display_name AS name, u.account_status AS accountStatus, m.status, m.facility_id AS facilityId, m.role, m.version
       FROM facility_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.organization_id = ?
         AND m.facility_id IN (${scoped.map(() => "?").join(",")})
         AND (? = '' OR u.display_name LIKE ?)
         AND (? = '' OR m.status = ?)
         AND (? = '' OR m.role = ?)
       ORDER BY u.display_name
       LIMIT 20 OFFSET ?`,
    )
    .all(actor.organizationId, ...scoped, like === "%%" ? "" : like, like, status, status, role, role, query.offset ?? 0) as Array<{
    id: string;
    name: string;
    accountStatus: string;
    status: string;
    facilityId: string;
    role: string;
    version: number;
  }>;
  const counts = get<{ active: number; suspended: number }>(
    db,
    `SELECT
       SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
       SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) AS suspended
     FROM facility_memberships WHERE organization_id = ? AND facility_id IN (${scoped.map(() => "?").join(",")})`,
    actor.organizationId,
    ...scoped,
  );
  const pending = get<{ c: number }>(db, `SELECT COUNT(*) AS c FROM workforce_invitations WHERE organization_id = ? AND status = 'pending'`, actor.organizationId);
  return { total: rows.length, pendingInvitations: pending?.c ?? 0, suspended: counts?.suspended ?? 0, active: counts?.active ?? 0, staff: rows };
}

export function readWorkforceMember(db: AppDatabase, actor: WorkforceActor, userId: string) {
  permit(db, actor, "workforce.read");
  const facilities = actorFacilities(db, actor).map((row) => row.id);
  const person = get<{ id: string; display_name: string; account_status: string; organization_id: string }>(
    db,
    `SELECT id, display_name, account_status, organization_id FROM users WHERE id = ?`,
    userId,
  );
  if (!person) throw new NotFoundError(HIDDEN);
  const memberships = db
    .prepare(
      `SELECT id, organization_id AS organizationId, facility_id AS facilityId, role, status, version
       FROM facility_memberships WHERE user_id = ? AND organization_id = ? AND facility_id IN (${facilities.map(() => "?").join(",") || "''"})`,
    )
    .all(userId, actor.organizationId, ...facilities) as Array<{ id: string; organizationId: string; facilityId: string; role: string; status: string; version: number }>;
  if (memberships.length === 0) throw new NotFoundError(HIDDEN);
  const roles = db
    .prepare(
      `SELECT id, role_id AS roleId, facility_id AS facilityId, status, version FROM authorization_assignments
       WHERE principal_id = ? AND organization_id = ?`,
    )
    .all(userId, actor.organizationId) as Array<{ id: string; roleId: string; facilityId: string; status: string; version: number }>;
  const external = get<{ id: string }>(db, `SELECT id FROM external_identities WHERE user_id = ? AND status = 'active'`, userId);
  const organization = get<{ status: string; version: number }>(
    db,
    `SELECT status, version FROM organization_memberships WHERE user_id = ? AND organization_id = ?`,
    userId,
    actor.organizationId,
  );
  return { id: person.id, name: person.display_name, accountStatus: person.account_status, identityLinked: Boolean(external), organization: organization ?? null, memberships, roles };
}

export function workforceFacilities(db: AppDatabase, actor: WorkforceActor) {
  permit(db, actor, "workforce.read");
  const facilities = actorFacilities(db, actor).map((row) => row.id);
  if (facilities.length === 0) return [];
  return db
    .prepare(`SELECT id, name FROM facilities WHERE organization_id = ? AND id IN (${facilities.map(() => "?").join(",")}) ORDER BY name`)
    .all(actor.organizationId, ...facilities) as Array<{ id: string; name: string }>;
}

export function inviteWorkforce(
  db: AppDatabase,
  actor: WorkforceActor,
  input: { email: string; roleId: string; facilityIds: string[]; idempotencyKey: string; reason: string },
) {
  permit(db, actor, "workforce.invite");
  if (!/^[^\s@]+@[^\s@]+$/.test(input.email) || input.email.length > 120) throw new ValidationError("invalid", "Enter a valid email address.");
  if (!/^[a-z-]+$/.test(input.roleId) || PRIVILEGED.has(input.roleId)) throw new ForbiddenError("forbidden", "That role cannot be granted on an invitation.");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) throw new ValidationError("invalid", "The request key is not valid.");
  if (input.facilityIds.length === 0) throw new ValidationError("invalid", "Choose a facility.");
  for (const facilityId of input.facilityIds) assertFacilityScope(db, actor, facilityId);
  const recent = get<{ c: number }>(
    db,
    `SELECT COUNT(*) AS c FROM workforce_invitations WHERE invited_by = ? AND created_at > ?`,
    actor.userId,
    new Date(Date.now() - 60 * 60 * 1000).toISOString(),
  );
  if ((recent?.c ?? 0) >= 20) throw new ForbiddenError("forbidden", "Invitation sending is temporarily limited.");
  const existing = get<{ id: string; status: string }>(
    db,
    `SELECT id, status FROM workforce_invitations WHERE organization_id = ? AND idempotency_key = ?`,
    actor.organizationId,
    input.idempotencyKey,
  );
  if (existing) return { id: existing.id, status: existing.status, replayed: true, token: null as string | null };
  const token = randomBytes(32).toString("base64url");
  const id = `wfi_${randomUUID()}`;
  const now = new Date();
  const delivery = get<{ value: string }>(db, `SELECT value FROM workforce_controls WHERE name = 'mail'`);
  transaction(db, () => {
    run(
      db,
      `INSERT INTO workforce_invitations
        (id, organization_id, email, role_id, status, invited_by, created_at, expires_at, accepted_at, cancelled_at, token_hash, idempotency_key, version, requires_external, bound_user_id)
       VALUES (?, ?, ?, ?, 'pending', ?, ?, ?, NULL, NULL, ?, ?, 1, 1, NULL)`,
      id,
      actor.organizationId,
      input.email,
      input.roleId,
      actor.userId,
      now.toISOString(),
      new Date(now.getTime() + DAY).toISOString(),
      hashToken(token),
      input.idempotencyKey,
    );
    for (const facilityId of input.facilityIds) {
      run(db, `INSERT INTO workforce_invitation_facilities (invitation_id, facility_id) VALUES (?, ?)`, id, facilityId);
    }
    run(
      db,
      `INSERT INTO workforce_outbox (id, invitation_id, status, attempt, created_at) VALUES (?, ?, ?, 1, ?)`,
      `wfo_${randomUUID()}`,
      id,
      delivery?.value === "down" ? "failed" : "captured",
      now.toISOString(),
    );
    event(db, actor.userId, id, "workforce.invite", actor.organizationId, null, "pending", input.reason || "invitation", correlation());
  });
  return { id, status: "pending", replayed: false, token, mailed: delivery?.value === "down" ? "failed" : "captured" };
}

export function listInvitations(db: AppDatabase, actor: WorkforceActor) {
  permit(db, actor, "workforce.read");
  return db
    .prepare(
      `SELECT id, email, role_id AS roleId, status, created_at AS createdAt, expires_at AS expiresAt, version
       FROM workforce_invitations WHERE organization_id = ? ORDER BY created_at DESC LIMIT 50`,
    )
    .all(actor.organizationId) as Array<{ id: string; email: string; roleId: string; status: string; createdAt: string; expiresAt: string; version: number }>;
}

function loadInvitation(db: AppDatabase, actor: WorkforceActor, invitationId: string) {
  const row = get<{ id: string; organization_id: string; status: string; version: number; token_hash: string; role_id: string; expires_at: string; requires_external: number }>(
    db,
    `SELECT id, organization_id, status, version, token_hash, role_id, expires_at, requires_external FROM workforce_invitations WHERE id = ?`,
    invitationId,
  );
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError(HIDDEN);
  return row;
}

export function resendInvitation(db: AppDatabase, actor: WorkforceActor, invitationId: string, expectedVersion: number) {
  permit(db, actor, "workforce.invite");
  const row = loadInvitation(db, actor, invitationId);
  if (row.version !== expectedVersion) throw new ConflictError("conflict", "The invitation changed. Refresh and try again.");
  if (row.status !== "pending") throw new ConflictError("conflict", "Only a pending invitation can be sent again.");
  const token = randomBytes(32).toString("base64url");
  const delivery = get<{ value: string }>(db, `SELECT value FROM workforce_controls WHERE name = 'mail'`);
  const changed = db
    .prepare(
      `UPDATE workforce_invitations SET token_hash = ?, version = version + 1, expires_at = ? WHERE id = ? AND version = ? AND status = 'pending'`,
    )
    .run(hashToken(token), new Date(Date.now() + DAY).toISOString(), invitationId, expectedVersion);
  if (changed.changes !== 1) throw new ConflictError("conflict", "The invitation changed. Refresh and try again.");
  run(
    db,
    `INSERT INTO workforce_outbox (id, invitation_id, status, attempt, created_at) VALUES (?, ?, ?, ?, ?)`,
    `wfo_${randomUUID()}`,
    invitationId,
    delivery?.value === "down" ? "failed" : "retried",
    2,
    new Date().toISOString(),
  );
  event(db, actor.userId, invitationId, "workforce.resend", actor.organizationId, "pending", "pending", "resend", correlation());
  return { id: invitationId, token, mailed: delivery?.value === "down" ? "failed" : "captured" };
}

export function cancelInvitation(db: AppDatabase, actor: WorkforceActor, invitationId: string, expectedVersion: number) {
  permit(db, actor, "workforce.invite");
  const row = loadInvitation(db, actor, invitationId);
  if (row.version !== expectedVersion) throw new ConflictError("conflict", "The invitation changed. Refresh and try again.");
  const changed = db
    .prepare(`UPDATE workforce_invitations SET status = 'cancelled', cancelled_at = ?, version = version + 1 WHERE id = ? AND version = ? AND status = 'pending'`)
    .run(new Date().toISOString(), invitationId, expectedVersion);
  if (changed.changes !== 1) throw new ConflictError("conflict", "The invitation is no longer pending.");
  event(db, actor.userId, invitationId, "workforce.cancel", actor.organizationId, "pending", "cancelled", "cancelled", correlation());
}

export function acceptInvitation(db: AppDatabase, input: { token: string; userId: string; externalLinked: boolean }) {
  if (get<{ value: string }>(db, `SELECT value FROM workforce_controls WHERE name = 'idp'`)?.value === "down") {
    throw new ForbiddenError("unavailable", "The identity provider is not available.");
  }
  if (!input.token || input.token.length < 20) throw new NotFoundError(HIDDEN);
  const row = get<{ id: string; organization_id: string; status: string; expires_at: string; role_id: string; requires_external: number; version: number; email: string }>(
    db,
    `SELECT id, organization_id, status, expires_at, role_id, requires_external, version, email FROM workforce_invitations WHERE token_hash = ?`,
    hashToken(input.token),
  );
  if (!row) throw new NotFoundError(HIDDEN);
  if (row.status === "cancelled") throw new ConflictError("conflict", "This invitation is no longer available.");
  if (row.status === "accepted") throw new ConflictError("conflict", "This invitation has already been used.");
  if (row.status !== "pending" || new Date(row.expires_at).getTime() < Date.now()) {
    run(db, `UPDATE workforce_invitations SET status = 'expired', version = version + 1 WHERE id = ? AND status = 'pending'`, row.id);
    throw new ConflictError("conflict", "This invitation has expired.");
  }
  if (row.requires_external && !input.externalLinked) throw new ForbiddenError("forbidden", "Sign in with the identity provider before accepting.");
  const facilities = db.prepare(`SELECT facility_id FROM workforce_invitation_facilities WHERE invitation_id = ?`).all(row.id) as Array<{ facility_id: string }>;
  transaction(db, () => {
    const changed = db
      .prepare(`UPDATE workforce_invitations SET status = 'accepted', accepted_at = ?, bound_user_id = ?, version = version + 1 WHERE id = ? AND status = 'pending' AND version = ?`)
      .run(new Date().toISOString(), input.userId, row.id, row.version);
    if (changed.changes !== 1) throw new ConflictError("conflict", "This invitation has already been used.");
    run(
      db,
      `INSERT INTO organization_memberships (id, organization_id, user_id, status, version) VALUES (?, ?, ?, 'active', 1)
       ON CONFLICT(organization_id, user_id) DO UPDATE SET status = 'active', version = version + 1`,
      `om_${row.organization_id}_${input.userId}`,
      row.organization_id,
      input.userId,
    );
    for (const facility of facilities) {
      run(
        db,
        `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version)
         VALUES (?, ?, ?, ?, ?, 'active', 1)
         ON CONFLICT(facility_id, user_id) DO UPDATE SET status = 'active', role = ?, version = version + 1`,
        `fm_${facility.facility_id}_${input.userId}`,
        row.organization_id,
        facility.facility_id,
        input.userId,
        row.role_id,
        row.role_id,
      );
      putAssignment(db, input.userId, row.role_id, row.organization_id, facility.facility_id, "invitation");
    }
    const home = facilities[0]?.facility_id;
    if (home) run(db, `UPDATE users SET facility_id = ? WHERE id = ? AND facility_id IS NULL`, home, input.userId);
    event(db, input.userId, input.userId, "workforce.accept", row.organization_id, "pending", "active", "accepted", correlation());
  });
  return { id: row.id, userId: input.userId, status: "active" };
}

export function assignWorkforceRole(db: AppDatabase, actor: WorkforceActor, input: { userId: string; roleId: string; facilityId: string; expectedVersion: number; reason: string }) {
  if (actor.userId === input.userId) throw new ForbiddenError("forbidden", "A person cannot assign a role to their own session.");
  assertFacilityScope(db, actor, input.facilityId);
  const privileged = PRIVILEGED.has(input.roleId);
  permit(db, actor, privileged ? "security.role.manage" : "workforce.assign-role");
  if (privileged && actor.assurance !== "mfa") throw new ForbiddenError("forbidden", "This role change needs a fresh MFA session.");
  if (!get(db, `SELECT id FROM authorization_roles WHERE id = ? AND status = 'active'`, input.roleId)) throw new NotFoundError(HIDDEN);
  const membership = get<{ version: number; status: string }>(
    db,
    `SELECT version, status FROM facility_memberships WHERE user_id = ? AND facility_id = ? AND organization_id = ?`,
    input.userId,
    input.facilityId,
    actor.organizationId,
  );
  if (!membership || membership.status !== "active") throw new NotFoundError(HIDDEN);
  if (membership.version !== input.expectedVersion) throw new ConflictError("conflict", "The membership changed. Refresh and try again.");
  const current = get<{ version: number }>(
    db,
    `SELECT version FROM authorization_assignments WHERE principal_id = ? AND role_id = ? AND organization_id = ? AND facility_id = ?`,
    input.userId,
    input.roleId,
    actor.organizationId,
    input.facilityId,
  );
  transaction(db, () => {
    const changed = db
      .prepare(`UPDATE facility_memberships SET role = ?, version = version + 1 WHERE user_id = ? AND facility_id = ? AND version = ?`)
      .run(input.roleId, input.userId, input.facilityId, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The membership changed. Refresh and try again.");
    putAssignment(db, input.userId, input.roleId, actor.organizationId, input.facilityId, actor.userId);
    event(db, actor.userId, input.userId, "workforce.assign-role", actor.organizationId, current ? "active" : null, input.roleId, input.reason || "role", correlation());
  });
}

export function revokeWorkforceRole(db: AppDatabase, actor: WorkforceActor, assignmentId: string, expectedVersion: number) {
  const row = get<{ id: string; principal_id: string; role_id: string; organization_id: string; facility_id: string; version: number; status: string }>(
    db,
    `SELECT id, principal_id, role_id, organization_id, facility_id, version, status FROM authorization_assignments WHERE id = ?`,
    assignmentId,
  );
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError(HIDDEN);
  permit(db, actor, PRIVILEGED.has(row.role_id) ? "security.role.manage" : "workforce.assign-role");
  if (row.version !== expectedVersion) throw new ConflictError("conflict", "The assignment changed. Refresh and try again.");
  if (row.role_id === "organization-administrator" && lastOrganizationAdministrator(db, actor.organizationId, row.principal_id)) {
    throw new ConflictError("conflict", "The last organization administrator cannot be removed. Recovery requires a recorded local procedure.");
  }
  const changed = db
    .prepare(`UPDATE authorization_assignments SET status = 'revoked', version = version + 1 WHERE id = ? AND version = ? AND status = 'active'`)
    .run(assignmentId, expectedVersion);
  if (changed.changes !== 1) throw new ConflictError("conflict", "The assignment changed. Refresh and try again.");
  clearCache(db, row.principal_id);
  event(db, actor.userId, row.principal_id, "workforce.revoke-role", actor.organizationId, row.role_id, "revoked", "revoked", correlation());
}

export function addWorkforceFacility(db: AppDatabase, actor: WorkforceActor, input: { userId: string; facilityId: string; roleId: string; reason: string }) {
  permit(db, actor, "workforce.update");
  assertFacilityScope(db, actor, input.facilityId);
  if (!/^[a-z-]+$/.test(input.roleId) || PRIVILEGED.has(input.roleId)) throw new ForbiddenError("forbidden", "That role cannot be added from this action.");
  const person = get<{ id: string }>(db, `SELECT id FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`, input.userId, actor.organizationId);
  if (!person) throw new NotFoundError(HIDDEN);
  transaction(db, () => {
    run(
      db,
      `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version)
       VALUES (?, ?, ?, ?, ?, 'active', 1)
       ON CONFLICT(facility_id, user_id) DO UPDATE SET status = 'active', role = ?, version = version + 1`,
      `fm_${input.facilityId}_${input.userId}`,
      actor.organizationId,
      input.facilityId,
      input.userId,
      input.roleId,
      input.roleId,
    );
    putAssignment(db, input.userId, input.roleId, actor.organizationId, input.facilityId, actor.userId);
    event(db, actor.userId, input.userId, "workforce.add-facility", actor.organizationId, null, input.facilityId, input.reason || "facility", correlation());
  });
}

export function transferWorkforce(db: AppDatabase, actor: WorkforceActor, input: { userId: string; fromFacilityId: string; toFacilityId: string; expectedVersion: number; reason: string }) {
  permit(db, actor, "workforce.update");
  assertFacilityScope(db, actor, input.fromFacilityId);
  assertFacilityScope(db, actor, input.toFacilityId);
  const membership = get<{ version: number; status: string; role: string }>(
    db,
    `SELECT version, status, role FROM facility_memberships WHERE user_id = ? AND facility_id = ? AND organization_id = ?`,
    input.userId,
    input.fromFacilityId,
    actor.organizationId,
  );
  if (!membership || membership.status !== "active") throw new NotFoundError(HIDDEN);
  if (membership.version !== input.expectedVersion) throw new ConflictError("conflict", "The membership changed. Refresh and try again.");
  transaction(db, () => {
    const removed = db
      .prepare(`UPDATE facility_memberships SET status = 'revoked', version = version + 1 WHERE user_id = ? AND facility_id = ? AND version = ?`)
      .run(input.userId, input.fromFacilityId, input.expectedVersion);
    if (removed.changes !== 1) throw new ConflictError("conflict", "The membership changed. Refresh and try again.");
    run(
      db,
      `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version)
       VALUES (?, ?, ?, ?, ?, 'active', 1)
       ON CONFLICT(facility_id, user_id) DO UPDATE SET status = 'active', role = ?, organization_id = ?, version = version + 1`,
      `fm_${input.toFacilityId}_${input.userId}`,
      actor.organizationId,
      input.toFacilityId,
      input.userId,
      membership.role,
      membership.role,
      actor.organizationId,
    );
    run(
      db,
      `UPDATE authorization_assignments SET status = 'revoked', version = version + 1
       WHERE principal_id = ? AND organization_id = ? AND facility_id = ? AND status = 'active'`,
      input.userId,
      actor.organizationId,
      input.fromFacilityId,
    );
    putAssignment(db, input.userId, membership.role, actor.organizationId, input.toFacilityId, actor.userId);
    run(db, `UPDATE users SET facility_id = ? WHERE id = ? AND facility_id = ?`, input.toFacilityId, input.userId, input.fromFacilityId);
    run(db, `UPDATE sessions SET active_facility_id = NULL, context_version = context_version + 1 WHERE user_id = ? AND active_facility_id = ?`, input.userId, input.fromFacilityId);
    event(db, actor.userId, input.userId, "workforce.transfer", actor.organizationId, input.fromFacilityId, input.toFacilityId, input.reason || "transfer", correlation());
  });
}

export function suspendWorkforce(db: AppDatabase, actor: WorkforceActor, input: { userId: string; scope: "organization" | "facility"; facilityId?: string; expectedVersion: number; reason: string }) {
  permit(db, actor, input.scope === "organization" ? "workforce.suspend" : "workforce.update");
  if (!input.reason.trim()) throw new ValidationError("invalid", "Enter a reason.");
  if (input.scope === "facility") {
    if (!input.facilityId) throw new ValidationError("invalid", "Choose a facility.");
    assertFacilityScope(db, actor, input.facilityId);
    const row = get<{ version: number }>(db, `SELECT version FROM facility_memberships WHERE user_id = ? AND facility_id = ? AND organization_id = ? AND status = 'active'`, input.userId, input.facilityId, actor.organizationId);
    if (!row || row.version !== input.expectedVersion) throw new ConflictError("conflict", "The membership changed. Refresh and try again.");
    const changed = db.prepare(`UPDATE facility_memberships SET status = 'suspended', version = version + 1 WHERE user_id = ? AND facility_id = ? AND version = ?`).run(input.userId, input.facilityId, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The membership changed. Refresh and try again.");
    run(db, `UPDATE sessions SET active_facility_id = NULL, context_version = context_version + 1 WHERE user_id = ? AND active_facility_id = ?`, input.userId, input.facilityId);
  } else {
    if (lastOrganizationAdministrator(db, actor.organizationId, input.userId)) throw new ConflictError("conflict", "The last organization administrator cannot be removed. Recovery requires a recorded local procedure.");
    const row = get<{ version: number }>(db, `SELECT version FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`, input.userId, actor.organizationId);
    if (!row || row.version !== input.expectedVersion) throw new ConflictError("conflict", "The membership changed. Refresh and try again.");
    const changed = db.prepare(`UPDATE organization_memberships SET status = 'suspended', version = version + 1 WHERE user_id = ? AND organization_id = ? AND version = ?`).run(input.userId, actor.organizationId, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The membership changed. Refresh and try again.");
    run(db, `UPDATE sessions SET active_organization_id = NULL, active_facility_id = NULL, context_version = context_version + 1 WHERE user_id = ? AND active_organization_id = ?`, input.userId, actor.organizationId);
  }
  clearCache(db, input.userId);
  event(db, actor.userId, input.userId, "workforce.suspend", actor.organizationId, "active", "suspended", input.reason, correlation());
}

export function reactivateWorkforce(db: AppDatabase, actor: WorkforceActor, input: { userId: string; scope: "organization" | "facility"; facilityId?: string; expectedVersion: number; reason: string }) {
  permit(db, actor, input.scope === "organization" ? "workforce.suspend" : "workforce.update");
  const org = get<{ status: string }>(db, `SELECT status FROM organizations WHERE id = ?`, actor.organizationId);
  if (!org || org.status !== "active") throw new ForbiddenError("closed", "This organization is not active.");
  if (input.scope === "facility") {
    if (!input.facilityId) throw new ValidationError("invalid", "Choose a facility.");
    facilityInOrg(db, actor.organizationId, input.facilityId);
    const changed = db
      .prepare(`UPDATE facility_memberships SET status = 'active', version = version + 1 WHERE user_id = ? AND facility_id = ? AND organization_id = ? AND status = 'suspended' AND version = ?`)
      .run(input.userId, input.facilityId, actor.organizationId, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The membership is not suspended at this version.");
  } else {
    const changed = db
      .prepare(`UPDATE organization_memberships SET status = 'active', version = version + 1 WHERE user_id = ? AND organization_id = ? AND status = 'suspended' AND version = ?`)
      .run(input.userId, actor.organizationId, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The membership is not suspended at this version.");
  }
  event(db, actor.userId, input.userId, "workforce.reactivate", actor.organizationId, "suspended", "active", input.reason || "reactivated", correlation());
}

export function offboardWorkforce(db: AppDatabase, actor: WorkforceActor, input: { userId: string; expectedVersion: number; reason: string }) {
  permit(db, actor, "workforce.suspend");
  if (!input.reason.trim()) throw new ValidationError("invalid", "Enter a reason.");
  if (lastOrganizationAdministrator(db, actor.organizationId, input.userId)) throw new ConflictError("conflict", "The last organization administrator cannot be removed. Recovery requires a recorded local procedure.");
  if (actor.userId === input.userId) throw new ForbiddenError("forbidden", "A person cannot offboard their own session.");
  const row = get<{ version: number }>(db, `SELECT version FROM organization_memberships WHERE user_id = ? AND organization_id = ? AND status = 'active'`, input.userId, actor.organizationId);
  if (!row || row.version !== input.expectedVersion) throw new ConflictError("conflict", "The membership changed. Refresh and try again.");
  transaction(db, () => {
    const changed = db.prepare(`UPDATE organization_memberships SET status = 'revoked', version = version + 1 WHERE user_id = ? AND organization_id = ? AND version = ?`).run(input.userId, actor.organizationId, input.expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The membership changed. Refresh and try again.");
    run(db, `UPDATE facility_memberships SET status = 'revoked', version = version + 1 WHERE user_id = ? AND organization_id = ? AND status <> 'revoked'`, input.userId, actor.organizationId);
    run(db, `UPDATE authorization_assignments SET status = 'revoked', version = version + 1 WHERE principal_id = ? AND organization_id = ? AND status = 'active'`, input.userId, actor.organizationId);
    run(db, `UPDATE sessions SET active_organization_id = NULL, active_facility_id = NULL, context_version = context_version + 1 WHERE user_id = ? AND active_organization_id = ?`, input.userId, actor.organizationId);
    clearCache(db, input.userId);
    const other = get<{ id: string }>(db, `SELECT id FROM organization_memberships WHERE user_id = ? AND status = 'active' AND organization_id <> ?`, input.userId, actor.organizationId);
    if (!other) revokeUserSessions(db, input.userId);
    event(db, actor.userId, input.userId, "workforce.offboard", actor.organizationId, "active", "revoked", input.reason, correlation());
  });
}

export function workforceHistory(db: AppDatabase, actor: WorkforceActor, userId?: string) {
  permit(db, actor, "workforce.read");
  if (userId) {
    readWorkforceMember(db, actor, userId);
    return db
      .prepare(`SELECT action, previous_state AS previousState, next_state AS nextState, reason, created_at AS createdAt, policy_version AS policyVersion FROM workforce_events WHERE target_id = ? AND organization_id = ? ORDER BY created_at DESC LIMIT 30`)
      .all(userId, actor.organizationId);
  }
  return db
    .prepare(`SELECT action, target_id AS targetId, previous_state AS previousState, next_state AS nextState, reason, created_at AS createdAt FROM workforce_events WHERE organization_id = ? ORDER BY created_at DESC LIMIT 30`)
    .all(actor.organizationId);
}

export function setWorkforceControl(db: AppDatabase, name: "mail" | "idp", value: string) {
  run(db, `INSERT INTO workforce_controls (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = ?`, name, value, value);
}

export function workforceActor(ctx: SessionContext, assurance = "directory") {
  return actorFrom(ctx, assurance);
}

export { actorFrom };
