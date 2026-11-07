import { randomUUID } from "node:crypto";
import type { AuthenticationResponseJSON } from "@simplewebauthn/server";
import { authorize, effectivePermissions } from "./authorization";
import type { AppDatabase } from "./db";
import { get, run, transaction } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { verifyUserTotp } from "./identity";
import { finishPasskeyAuthentication } from "./webauthn";

export const EMERGENCY_POLICY_ID = "pol_demo_gh_synthetic";
export const SYNTHETIC_RESOURCE_ID = "syn_kojo_agyeman";
export const EMERGENCY_MAX_SECONDS = 900;
export const EMERGENCY_FRESHNESS_MS = 5 * 60 * 1000;

const REASONS = new Set(["emergency-treatment"]);
const now = () => new Date().toISOString();
const id = (prefix: string) => `${prefix}_${randomUUID()}`;

export type EmergencyActor = {
  userId: string;
  sessionId: string;
  organizationId: string;
  facilityId: string | null;
};

export function emergencyView(active: boolean, content: string | null) {
  return active ? content : null;
}

export function seedEmergency(db: AppDatabase) {
  const org = get<{ id: string }>(db, `SELECT id FROM organizations WHERE id = 'org_demo_gh'`);
  if (!org) return;
  run(
    db,
    `INSERT INTO emergency_policies (id, organization_id, facility_id, environment, resource_type, action, overridable_reason, status, version)
     VALUES (?, 'org_demo_gh', 'fac_gh_accra', 'development', 'SyntheticRestrictedRecord', 'synthetic.read', 'relationship-required', 'enabled', 1)
     ON CONFLICT(organization_id, facility_id, environment, resource_type, action) DO NOTHING`,
    EMERGENCY_POLICY_ID,
  );
  run(
    db,
    `INSERT INTO emergency_resources (id, organization_id, facility_id, display_name, summary)
     VALUES (?, 'org_demo_gh', 'fac_gh_accra', 'Kojo Agyeman', ?)
     ON CONFLICT(id) DO NOTHING`,
    SYNTHETIC_RESOURCE_ID,
    "Synthetic restricted test record. This is not a diagnosis, a treatment recommendation, or a clinical chart.",
  );
  run(db, `INSERT INTO emergency_controls (name, value) VALUES ('reviewer', 'usr_gh_reviewer') ON CONFLICT(name) DO NOTHING`);
  run(db, `INSERT INTO emergency_controls (name, value) VALUES ('delivery', 'sandbox') ON CONFLICT(name) DO NOTHING`);
  run(
    db,
    `CREATE INDEX IF NOT EXISTS emergency_grants_lookup ON emergency_grants (principal_id, session_id, resource_id, action, status)`,
  );
}

export function setEmergencyControl(db: AppDatabase, name: "reviewer" | "delivery" | "commit", value: string) {
  run(db, `INSERT INTO emergency_controls (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = ?`, name, value, value);
  event(db, null, null, "system", "policy-changed", "deny", null, null, "recorded", name, 1, id("cor"));
}

export function emergencyEligibility(db: AppDatabase, actor: EmergencyActor, resourceId: string) {
  const gate = gateActor(db, actor);
  if (!gate.ok) return { eligible: false, reason: gate.reason };
  const resource = get<{ id: string; organization_id: string; facility_id: string }>(
    db,
    `SELECT id, organization_id, facility_id FROM emergency_resources WHERE id = ?`,
    resourceId,
  );
  if (!resource || resource.organization_id !== actor.organizationId || resource.facility_id !== actor.facilityId) {
    return { eligible: false, reason: "not-eligible" };
  }
  const policy = enabledPolicy(db, actor);
  if (!policy) return { eligible: false, reason: "policy-disabled" };
  if (!reviewerConfigured(db)) return { eligible: false, reason: "reviewer-missing" };
  return { eligible: true, reason: "relationship-required", policyId: policy.id, policyVersion: policy.version, resourceId: resource.id };
}

export function requestEmergency(
  db: AppDatabase,
  actor: EmergencyActor,
  input: { resourceId: string; reasonCategory: string; justification: string; durationSeconds: number; idempotencyKey: string },
) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) throw new ValidationError("invalid", "Use a new request key.");
  const existing = get<{ id: string }>(db, `SELECT id FROM emergency_requests WHERE organization_id = ? AND idempotency_key = ?`, actor.organizationId, input.idempotencyKey);
  if (existing) return readRequest(db, existing.id);
  const eligibility = emergencyEligibility(db, actor, input.resourceId);
  if (!eligibility.eligible) {
    event(db, null, null, actor.userId, "request-denied", "deny", input.resourceId, "synthetic.read", "denied", eligibility.reason, 1, id("cor"));
    throw new ForbiddenError("closed", "Emergency access is not available.");
  }
  if (!REASONS.has(input.reasonCategory) || input.justification.trim().length < 8) throw new ValidationError("invalid", "A reason and justification are required.");
  if (!Number.isInteger(input.durationSeconds) || input.durationSeconds < 30 || input.durationSeconds > EMERGENCY_MAX_SECONDS) {
    throw new ValidationError("range", "The requested duration is outside the allowed window.");
  }
  const requestId = id("erq");
  const correlation = id("cor");
  run(
    db,
    `INSERT INTO emergency_requests (
      id, principal_id, session_id, organization_id, facility_id, resource_type, resource_id, action, purpose,
      reason_category, justification, duration_seconds, status, assurance_required, policy_id, policy_version,
      correlation_id, idempotency_key, version, created_at
    ) VALUES (?, ?, ?, ?, ?, 'SyntheticRestrictedRecord', ?, 'synthetic.read', 'treatment', ?, ?, ?, 'challenge_required', 'mfa', ?, ?, ?, ?, 1, ?)`,
    requestId,
    actor.userId,
    actor.sessionId,
    actor.organizationId,
    actor.facilityId,
    input.resourceId,
    input.reasonCategory,
    input.justification.trim(),
    input.durationSeconds,
    eligibility.policyId ?? null,
    eligibility.policyVersion ?? null,
    correlation,
    input.idempotencyKey,
    now(),
  );
  event(db, requestId, null, actor.userId, "request-created", "deny", input.resourceId, "synthetic.read", "recorded", "challenge-required", eligibility.policyVersion ?? 1, correlation);
  return readRequest(db, requestId);
}

export function verifyEmergencyTotp(db: AppDatabase, actor: EmergencyActor, requestId: string, code: string) {
  const request = ownRequest(db, actor, requestId);
  if (request.status !== "challenge_required") throw new ConflictError("conflict", "This request is not waiting for verification.");
  try {
    verifyUserTotp(db, actor.userId, code);
  } catch (error) {
    event(db, requestId, null, actor.userId, "step-up-failed", "deny", request.resource_id, "synthetic.read", "denied", "step-up-failed", request.policy_version ?? 1, request.correlation_id);
    throw error;
  }
  const challengeId = id("ech");
  run(
    db,
    `INSERT INTO emergency_challenges (id, request_id, user_id, method, expires_at, consumed_at, attempts) VALUES (?, ?, ?, 'totp', ?, ?, 1)`,
    challengeId,
    requestId,
    actor.userId,
    new Date(Date.now() + EMERGENCY_FRESHNESS_MS).toISOString(),
    now(),
  );
  run(db, `UPDATE emergency_requests SET status = 'authorized', version = version + 1 WHERE id = ? AND version = ?`, requestId, request.version);
  event(db, requestId, null, actor.userId, "step-up-succeeded", "permit", request.resource_id, "synthetic.read", "recorded", "totp", request.policy_version ?? 1, request.correlation_id);
  return { requestId, challengeId, status: "authorized" };
}

export async function verifyEmergencyPasskey(db: AppDatabase, actor: EmergencyActor, requestId: string, challengeId: string, response: AuthenticationResponseJSON) {
  const request = ownRequest(db, actor, requestId);
  if (request.status !== "challenge_required") throw new ConflictError("conflict", "This request is not waiting for verification.");
  let userId = "";
  try {
    userId = await finishPasskeyAuthentication(db, challengeId, response);
  } catch (error) {
    event(db, requestId, null, actor.userId, "step-up-failed", "deny", request.resource_id, "synthetic.read", "denied", "step-up-failed", request.policy_version ?? 1, request.correlation_id);
    throw error;
  }
  if (userId !== actor.userId) throw new ForbiddenError("closed", "That verification belongs to a different session.");
  run(
    db,
    `INSERT INTO emergency_challenges (id, request_id, user_id, method, expires_at, consumed_at, attempts) VALUES (?, ?, ?, 'passkey', ?, ?, 1)`,
    id("ech"),
    requestId,
    actor.userId,
    new Date(Date.now() + EMERGENCY_FRESHNESS_MS).toISOString(),
    now(),
  );
  run(db, `UPDATE emergency_requests SET status = 'authorized', version = version + 1 WHERE id = ? AND version = ?`, requestId, request.version);
  event(db, requestId, null, actor.userId, "step-up-succeeded", "permit", request.resource_id, "synthetic.read", "recorded", "passkey", request.policy_version ?? 1, request.correlation_id);
  return { requestId, status: "authorized" };
}

export function activateEmergency(db: AppDatabase, actor: EmergencyActor, requestId: string) {
  const request = ownRequest(db, actor, requestId);
  const prior = get<{ id: string }>(db, `SELECT id FROM emergency_grants WHERE request_id = ?`, requestId);
  if (prior) return readGrant(db, prior.id);
  if (request.status !== "authorized") throw new ForbiddenError("closed", "Verification is still required.");
  const challenge = get<{ consumed_at: string | null }>(db, `SELECT consumed_at FROM emergency_challenges WHERE request_id = ? ORDER BY consumed_at DESC LIMIT 1`, requestId);
  if (!challenge?.consumed_at || Date.now() - Date.parse(challenge.consumed_at) > EMERGENCY_FRESHNESS_MS) {
    throw new ForbiddenError("closed", "Verification is no longer fresh.");
  }
  const eligibility = emergencyEligibility(db, actor, request.resource_id);
  if (!eligibility.eligible) throw new ForbiddenError("closed", "Emergency access is not available.");
  const grantId = id("egr");
  const effective = now();
  const expires = new Date(Date.now() + request.duration_seconds * 1000).toISOString();
  transaction(db, () => {
    run(
      db,
      `INSERT INTO emergency_grants (
        id, request_id, principal_id, session_id, organization_id, facility_id, resource_type, resource_id, action,
        effective_at, expires_at, revoked_at, status, policy_version, assurance_ref, version
      ) VALUES (?, ?, ?, ?, ?, ?, 'SyntheticRestrictedRecord', ?, 'synthetic.read', ?, ?, NULL, 'active', ?, ?, 1)`,
      grantId,
      requestId,
      actor.userId,
      actor.sessionId,
      actor.organizationId,
      actor.facilityId,
      request.resource_id,
      effective,
      expires,
      request.policy_version ?? 1,
      `challenge:${requestId}`,
    );
    if (control(db, "commit") === "fail") throw new ConflictError("conflict", "The grant could not be recorded.");
    run(db, `UPDATE emergency_requests SET status = 'active', version = version + 1 WHERE id = ?`, requestId);
    const eventId = event(db, requestId, grantId, actor.userId, "grant-created", "permit", request.resource_id, "synthetic.read", "allowed", "emergency-grant", request.policy_version ?? 1, request.correlation_id);
    const reviewId = id("erv");
    run(
      db,
      `INSERT INTO emergency_reviews (id, request_id, grant_id, organization_id, facility_id, reviewer_id, status, opened_at, deadline_at, reviewed_at, disposition, notes, escalation, version)
       VALUES (?, ?, ?, ?, ?, NULL, 'pending_review', ?, ?, NULL, NULL, NULL, NULL, 1)`,
      reviewId,
      requestId,
      grantId,
      actor.organizationId,
      actor.facilityId,
      effective,
      new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    );
    const reviewer = control(db, "reviewer");
    const failed = control(db, "delivery") === "fail";
    run(
      db,
      `INSERT INTO emergency_alerts (id, event_id, recipient_id, channel, status, attempt, failure_category, created_at, delivered_at)
       VALUES (?, ?, ?, 'local-sandbox', ?, 1, ?, ?, ?)`,
      id("eal"),
      eventId,
      reviewer,
      failed ? "failed" : "captured",
      failed ? "sandbox-unavailable" : null,
      effective,
      failed ? null : effective,
    );
  });
  return readGrant(db, grantId);
}

export function currentEmergencyGrant(db: AppDatabase, actor: EmergencyActor) {
  reconcileExpired(db, actor.userId);
  return (
    get<{ id: string; resource_id: string; action: string; expires_at: string; status: string; request_id: string }>(
      db,
      `SELECT id, resource_id, action, expires_at, status, request_id FROM emergency_grants
       WHERE principal_id = ? AND session_id = ? AND organization_id = ? AND facility_id = ? AND status = 'active' AND revoked_at IS NULL AND expires_at > ?`,
      actor.userId,
      actor.sessionId,
      actor.organizationId,
      actor.facilityId ?? "",
      now(),
    ) ?? null
  );
}

export function readSyntheticEmergency(db: AppDatabase, actor: EmergencyActor, resourceId: string) {
  const decision = authorizeSynthetic(db, actor, resourceId);
  if (!decision.allow) throw new ForbiddenError("closed", "That record is not available.");
  const row = get<{ display_name: string; summary: string }>(db, `SELECT display_name, summary FROM emergency_resources WHERE id = ?`, resourceId);
  if (!row) throw new NotFoundError("That record is not available.");
  return row;
}

export function revokeEmergencyGrant(db: AppDatabase, actor: EmergencyActor, grantId: string) {
  const access = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId);
  const grant = get<{ id: string; principal_id: string; status: string; organization_id: string; version: number; request_id: string; policy_version: number; correlation: string }>(
    db,
    `SELECT g.id, g.principal_id, g.status, g.organization_id, g.version, g.request_id, g.policy_version, r.correlation_id AS correlation
     FROM emergency_grants g JOIN emergency_requests r ON r.id = g.request_id WHERE g.id = ?`,
    grantId,
  );
  if (!grant || grant.organization_id !== actor.organizationId) throw new NotFoundError("That emergency grant is not available.");
  const self = grant.principal_id === actor.userId;
  if (!self && !access.permissions.includes("emergency.grant.revoke")) throw new ForbiddenError();
  if (grant.status !== "active") return readGrant(db, grant.id);
  run(db, `UPDATE emergency_grants SET status = 'revoked', revoked_at = ?, version = version + 1 WHERE id = ? AND status = 'active'`, now(), grant.id);
  run(db, `UPDATE emergency_requests SET status = 'revoked', version = version + 1 WHERE id = ?`, grant.request_id);
  event(db, grant.request_id, grant.id, actor.userId, "grant-revoked", "deny", null, "synthetic.read", "revoked", "revoked", grant.policy_version, grant.correlation);
  return readGrant(db, grant.id);
}

export function revokeEmergencyForSession(db: AppDatabase, sessionId: string) {
  const rows = db.prepare(`SELECT id FROM emergency_grants WHERE session_id = ? AND status = 'active'`).all(sessionId) as Array<{ id: string }>;
  for (const row of rows) {
    run(db, `UPDATE emergency_grants SET status = 'revoked', revoked_at = ?, version = version + 1 WHERE id = ? AND status = 'active'`, now(), row.id);
    event(db, null, row.id, "system", "grant-revoked", "deny", null, "synthetic.read", "revoked", "session-ended", 1, id("cor"));
  }
}

export function emergencyHistory(db: AppDatabase, actor: EmergencyActor) {
  return db
    .prepare(
      `SELECT r.id, r.created_at, r.reason_category, r.resource_id, r.status, g.expires_at, v.status AS review_status
       FROM emergency_requests r
       LEFT JOIN emergency_grants g ON g.request_id = r.id
       LEFT JOIN emergency_reviews v ON v.request_id = r.id
       WHERE r.principal_id = ? AND r.organization_id = ?
       ORDER BY r.created_at DESC`,
    )
    .all(actor.userId, actor.organizationId);
}

export function listEmergencyReviews(db: AppDatabase, actor: EmergencyActor) {
  assertReview(db, actor, "emergency.review.read");
  return db
    .prepare(
      `SELECT id, request_id, grant_id, status, opened_at, deadline_at, reviewer_id, disposition
       FROM emergency_reviews WHERE organization_id = ? ORDER BY opened_at DESC`,
    )
    .all(actor.organizationId);
}

export function readEmergencyReview(db: AppDatabase, actor: EmergencyActor, reviewId: string) {
  assertReview(db, actor, "emergency.review.read");
  const review = reviewRow(db, reviewId, actor.organizationId);
  const request = get<{ reason_category: string; justification: string; principal_id: string; resource_id: string }>(
    db,
    `SELECT reason_category, justification, principal_id, resource_id FROM emergency_requests WHERE id = ?`,
    review.request_id,
  );
  const events = db
    .prepare(`SELECT event_type, created_at, decision, action, outcome, reason_code FROM emergency_events WHERE request_id = ? OR grant_id = ? ORDER BY created_at`)
    .all(review.request_id, review.grant_id);
  event(db, review.request_id, review.grant_id, actor.userId, "review-opened", "permit", null, null, "recorded", "review", 1, id("cor"));
  return { review, request, events };
}

export function assignEmergencyReview(db: AppDatabase, actor: EmergencyActor, reviewId: string, reviewerId: string) {
  assertReview(db, actor, "emergency.review.assign");
  const review = reviewRow(db, reviewId, actor.organizationId);
  if (reviewerId === get<{ principal_id: string }>(db, `SELECT principal_id FROM emergency_requests WHERE id = ?`, review.request_id)?.principal_id) {
    throw new ForbiddenError("closed", "The requester cannot review this access.");
  }
  const updated = db.prepare(`UPDATE emergency_reviews SET reviewer_id = ?, status = 'in_review', version = version + 1 WHERE id = ? AND version = ?`).run(reviewerId, review.id, review.version);
  if (updated.changes !== 1) throw new ConflictError("conflict", "This review changed. Reload it.");
  return reviewRow(db, reviewId, actor.organizationId);
}

export function disposeEmergencyReview(db: AppDatabase, actor: EmergencyActor, reviewId: string, disposition: "closed_appropriate" | "closed_inappropriate", notes: string) {
  assertReview(db, actor, "emergency.review.disposition");
  const review = reviewRow(db, reviewId, actor.organizationId);
  const requester = get<{ principal_id: string }>(db, `SELECT principal_id FROM emergency_requests WHERE id = ?`, review.request_id)?.principal_id;
  if (actor.userId === requester) throw new ForbiddenError("closed", "The requester cannot review this access.");
  if (notes.trim().length < 8) throw new ValidationError("invalid", "Review notes are required.");
  const updated = db
    .prepare(`UPDATE emergency_reviews SET status = ?, disposition = ?, notes = ?, reviewed_at = ?, reviewer_id = ?, version = version + 1 WHERE id = ? AND version = ? AND status IN ('pending_review','in_review')`)
    .run(disposition, disposition, notes.trim(), now(), actor.userId, review.id, review.version);
  if (updated.changes !== 1) throw new ConflictError("conflict", "This review changed. Reload it.");
  event(db, review.request_id, review.grant_id, actor.userId, "review-disposition", "permit", null, null, disposition, "review", 1, id("cor"));
  return reviewRow(db, reviewId, actor.organizationId);
}

export function escalateEmergencyReview(db: AppDatabase, actor: EmergencyActor, reviewId: string, notes: string) {
  assertReview(db, actor, "emergency.review.escalate");
  const review = reviewRow(db, reviewId, actor.organizationId);
  if (notes.trim().length < 8) throw new ValidationError("invalid", "Escalation notes are required.");
  const updated = db
    .prepare(`UPDATE emergency_reviews SET status = 'escalated', escalation = ?, notes = ?, reviewed_at = ?, reviewer_id = ?, version = version + 1 WHERE id = ? AND version = ?`)
    .run(notes.trim(), notes.trim(), now(), actor.userId, review.id, review.version);
  if (updated.changes !== 1) throw new ConflictError("conflict", "This review changed. Reload it.");
  event(db, review.request_id, review.grant_id, actor.userId, "review-escalated", "permit", null, null, "escalated", "review", 1, id("cor"));
  return reviewRow(db, reviewId, actor.organizationId);
}

export function retryEmergencyAlert(db: AppDatabase, alertId: string) {
  const row = get<{ id: string; status: string; attempt: number }>(db, `SELECT id, status, attempt FROM emergency_alerts WHERE id = ?`, alertId);
  if (!row) throw new NotFoundError("That alert is not available.");
  if (control(db, "delivery") === "fail") {
    run(db, `UPDATE emergency_alerts SET status = 'failed', attempt = attempt + 1, failure_category = 'sandbox-unavailable' WHERE id = ?`, alertId);
  } else {
    run(db, `UPDATE emergency_alerts SET status = 'retried', attempt = attempt + 1, delivered_at = ?, failure_category = NULL WHERE id = ?`, now(), alertId);
  }
  return get(db, `SELECT id, status, attempt, failure_category FROM emergency_alerts WHERE id = ?`, alertId);
}

export function cancelEmergency(db: AppDatabase, actor: EmergencyActor, requestId: string) {
  const request = ownRequest(db, actor, requestId);
  if (request.status === "active") return revokeOwned(db, actor, requestId);
  if (request.status !== "challenge_required" && request.status !== "authorized") throw new ConflictError("conflict", "This request can no longer be cancelled.");
  run(db, `UPDATE emergency_requests SET status = 'cancelled', version = version + 1 WHERE id = ?`, requestId);
  event(db, requestId, null, actor.userId, "request-cancelled", "deny", request.resource_id, "synthetic.read", "cancelled", "cancelled", request.policy_version ?? 1, request.correlation_id);
  return readRequest(db, requestId);
}

function revokeOwned(db: AppDatabase, actor: EmergencyActor, requestId: string) {
  const grant = get<{ id: string }>(db, `SELECT id FROM emergency_grants WHERE request_id = ?`, requestId);
  if (!grant) throw new NotFoundError("That emergency grant is not available.");
  return revokeEmergencyGrant(db, actor, grant.id);
}

function authorizeSynthetic(db: AppDatabase, actor: EmergencyActor, resourceId: string) {
  return authorize(
    db,
    { principalId: actor.userId },
    "synthetic.read",
    { type: "SyntheticRestrictedRecord", id: resourceId, organizationId: actor.organizationId, facilityId: actor.facilityId, sensitivity: "standard", relationship: "required" },
    { purpose: "TREATMENT", relationshipAssigned: false, sessionId: actor.sessionId },
  );
}

function gateActor(db: AppDatabase, actor: EmergencyActor) {
  const user = get<{ account_status: string }>(db, `SELECT account_status FROM users WHERE id = ?`, actor.userId);
  if (!user || user.account_status !== "active") return { ok: false as const, reason: "account-disabled" };
  const membership = get<{ status: string }>(db, `SELECT status FROM organization_memberships WHERE user_id = ? AND organization_id = ?`, actor.userId, actor.organizationId);
  if (membership && membership.status !== "active") return { ok: false as const, reason: "membership" };
  const session = get<{ revoked_at: string | null; absolute_expires_at: string }>(db, `SELECT revoked_at, absolute_expires_at FROM auth_sessions WHERE session_id = ?`, actor.sessionId);
  if (session && (session.revoked_at || session.absolute_expires_at <= now())) return { ok: false as const, reason: "session" };
  const access = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId);
  if (!access.permissions.includes("emergency.request")) return { ok: false as const, reason: "not-eligible" };
  if (process.env.CURASPHERE_ENV === "production" || process.env.CURASPHERE_ENV === "staging") return { ok: false as const, reason: "policy-disabled" };
  return { ok: true as const, reason: "ok" };
}

function enabledPolicy(db: AppDatabase, actor: EmergencyActor) {
  return get<{ id: string; version: number }>(
    db,
    `SELECT id, version FROM emergency_policies
     WHERE organization_id = ? AND facility_id = ? AND environment = 'development' AND resource_type = 'SyntheticRestrictedRecord' AND action = 'synthetic.read' AND status = 'enabled'`,
    actor.organizationId,
    actor.facilityId ?? "",
  );
}

function reviewerConfigured(db: AppDatabase) {
  const reviewer = control(db, "reviewer");
  if (!reviewer || reviewer === "missing") return false;
  const row = get<{ id: string }>(db, `SELECT id FROM users WHERE id = ? AND account_status = 'active'`, reviewer);
  return Boolean(row);
}

function ownRequest(db: AppDatabase, actor: EmergencyActor, requestId: string) {
  const request = get<{
    id: string;
    principal_id: string;
    session_id: string;
    organization_id: string;
    status: string;
    version: number;
    resource_id: string;
    policy_version: number | null;
    correlation_id: string;
    duration_seconds: number;
  }>(
    db,
    `SELECT id, principal_id, session_id, organization_id, status, version, resource_id, policy_version, correlation_id, duration_seconds FROM emergency_requests WHERE id = ?`,
    requestId,
  );
  if (!request || request.principal_id !== actor.userId || request.session_id !== actor.sessionId || request.organization_id !== actor.organizationId) {
    throw new NotFoundError("That emergency request is not available.");
  }
  return request;
}

function readRequest(db: AppDatabase, requestId: string) {
  return get(db, `SELECT id, status, resource_id, reason_category, version FROM emergency_requests WHERE id = ?`, requestId);
}

function readGrant(db: AppDatabase, grantId: string) {
  return get(db, `SELECT id, request_id, status, resource_id, action, expires_at, revoked_at FROM emergency_grants WHERE id = ?`, grantId);
}

function reviewRow(db: AppDatabase, reviewId: string, organizationId: string) {
  const review = get<{ id: string; request_id: string; grant_id: string; organization_id: string; status: string; version: number }>(
    db,
    `SELECT id, request_id, grant_id, organization_id, status, version FROM emergency_reviews WHERE id = ?`,
    reviewId,
  );
  if (!review || review.organization_id !== organizationId) throw new NotFoundError("That review is not available.");
  return review;
}

function assertReview(db: AppDatabase, actor: EmergencyActor, permission: string) {
  const access = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId);
  if (!access.permissions.includes(permission)) throw new ForbiddenError();
}

function control(db: AppDatabase, name: string) {
  return get<{ value: string }>(db, `SELECT value FROM emergency_controls WHERE name = ?`, name)?.value ?? "";
}

function reconcileExpired(db: AppDatabase, principalId: string) {
  const rows = db.prepare(`SELECT id, request_id FROM emergency_grants WHERE principal_id = ? AND status = 'active' AND expires_at <= ?`).all(principalId, now()) as Array<{ id: string; request_id: string }>;
  for (const row of rows) {
    run(db, `UPDATE emergency_grants SET status = 'expired', version = version + 1 WHERE id = ? AND status = 'active'`, row.id);
    run(db, `UPDATE emergency_requests SET status = 'expired', version = version + 1 WHERE id = ? AND status = 'active'`, row.request_id);
    event(db, row.request_id, row.id, "system", "grant-expired", "deny", null, "synthetic.read", "expired", "expired", 1, id("cor"));
  }
}

function event(
  db: AppDatabase,
  requestId: string | null,
  grantId: string | null,
  actorId: string,
  eventType: string,
  decision: string,
  resourceId: string | null,
  action: string | null,
  outcome: string,
  reason: string,
  policyVersion: number,
  correlationId: string,
) {
  const eventId = id("eem");
  run(
    db,
    `INSERT INTO emergency_events (id, request_id, grant_id, actor_id, event_type, created_at, decision, resource_id, action, outcome, reason_code, policy_version, correlation_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    eventId,
    requestId,
    grantId,
    actorId,
    eventType,
    now(),
    decision,
    resourceId,
    action,
    outcome,
    reason,
    policyVersion,
    correlationId,
  );
  return eventId;
}
