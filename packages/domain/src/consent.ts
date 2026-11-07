import { createHash, randomUUID } from "node:crypto";
import { appendAccessLedger } from "./access-ledger";
import { effectivePermissions, registerConsentGate, type AuthzContext, type AuthzResource } from "./authorization";
import type { AppDatabase } from "./db";
import { all, get, run, transaction } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";

export const CONSENT_POLICY_VERSION = 1;
export const SUBJECT_AKUA = "sub_akua_boateng";
export const PRIVACY_OFFICER = "usr_gh_privacy";
const ALLOWED_EVIDENCE = new Set(["evidence_self_ack", "evidence_guardian_order"]);
const CONSENT_ACTIONS: Record<string, { purpose: string; kind: string }> = {
  "consent.communication.dispatch": { purpose: "COMMUNICATION", kind: "communication" },
  "consent.sharing.release": { purpose: "SHARING", kind: "sharing" },
  "consent.research.use": { purpose: "RESEARCH", kind: "research" },
};

export type ConsentActor = {
  userId: string;
  organizationId: string;
  facilityId: string | null;
  sessionId: string;
};

export type ConsentEvaluation = {
  result: "allow" | "deny" | "not_applicable" | "error";
  reason: string;
  directiveId: string | null;
  version: number | null;
  policyVersion: number;
};

type DirectiveRow = {
  id: string;
  organization_id: string;
  facility_id: string | null;
  subject_id: string;
  subject_type: string;
  category: string;
  purpose: string;
  action: string;
  resource_category: string;
  recipient: string;
  jurisdiction: string;
  grantor_id: string;
  authority_id: string;
  verification_status: string;
  decision: string;
  status: string;
  effective_at: string | null;
  expires_at: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  correlation_id: string;
};

function sha(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function count(db: AppDatabase, name: string) {
  run(
    db,
    `INSERT INTO consent_controls (name, value) VALUES (?, '1')
     ON CONFLICT(name) DO UPDATE SET value = CAST(CAST(value AS INTEGER) + 1 AS TEXT)`,
    name,
  );
}

function requirePermission(db: AppDatabase, actor: ConsentActor, permission: string) {
  if (!actor.sessionId) throw new ForbiddenError("forbidden", "Sign in is required.");
  const access = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId);
  if (!access.permissions.includes(permission)) throw new ForbiddenError();
}

function dependencyOpen(db: AppDatabase) {
  const row = get<{ value: string }>(db, `SELECT value FROM consent_controls WHERE name = 'dependency'`);
  return !row || row.value === "available";
}

function ledger(db: AppDatabase, actor: ConsentActor, action: string, resourceId: string | null, subjectId: string | null, outcome: "success" | "denied") {
  appendAccessLedger(db, {
    organizationId: actor.organizationId,
    facilityId: actor.facilityId,
    actorId: actor.userId,
    subjectId,
    action,
    resourceType: "ConsentDirective",
    resourceId,
    purpose: "AUDIT",
    outcome,
    correlationId: actor.sessionId,
    before: null,
    after: { resourceType: "ConsentDirective", resourceId: resourceId ?? "none", version: "1", fields: ["status"] },
  });
}

function snapshot(row: DirectiveRow) {
  return sha(JSON.stringify({
    id: row.id,
    status: row.status,
    purpose: row.purpose,
    action: row.action,
    recipient: row.recipient,
    version: row.version,
    decision: row.decision,
  }));
}

function writeVersion(db: AppDatabase, row: DirectiveRow, actor: ConsentActor, changeCode: string, reasonCode: string) {
  const previous = get<{ snapshot_hash: string }>(
    db,
    `SELECT snapshot_hash FROM consent_versions WHERE consent_id = ? ORDER BY version DESC LIMIT 1`,
    row.id,
  );
  run(
    db,
    `INSERT INTO consent_versions (
      id, consent_id, version, snapshot_hash, previous_hash, change_code, actor_id, reason_code, effective_at, recorded_at, correlation_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    row.id,
    row.version,
    snapshot(row),
    previous?.snapshot_hash ?? "consent-genesis",
    changeCode,
    actor.userId,
    reasonCode,
    row.effective_at ?? row.updated_at,
    row.updated_at,
    actor.sessionId,
  );
}

function loadDirective(db: AppDatabase, actor: ConsentActor, id: string) {
  const row = get<DirectiveRow>(db, `SELECT * FROM consent_directives WHERE id = ?`, id);
  if (!row || row.organization_id !== actor.organizationId) throw new NotFoundError("That consent record is not available.");
  if (actor.facilityId && row.facility_id && row.facility_id !== actor.facilityId) throw new NotFoundError("That consent record is not available.");
  return row;
}

export function seedConsent(db: AppDatabase) {
  if (!get(db, `SELECT id FROM organizations WHERE id = 'org_demo_gh'`)) return;
  const now = new Date().toISOString();
  run(db, `INSERT INTO users (id, organization_id, facility_id, display_name, role) VALUES ('usr_gh_privacy', 'org_demo_gh', 'fac_gh_accra', 'Kojo Asante', 'auditor') ON CONFLICT(id) DO NOTHING`);
  run(db, `INSERT INTO organization_memberships (id, organization_id, user_id, status, version) VALUES ('om_org_demo_gh_usr_gh_privacy', 'org_demo_gh', 'usr_gh_privacy', 'active', 1) ON CONFLICT(organization_id, user_id) DO NOTHING`);
  run(db, `INSERT INTO facility_memberships (id, organization_id, facility_id, user_id, role, status, version) VALUES ('fm_fac_gh_accra_usr_gh_privacy', 'org_demo_gh', 'fac_gh_accra', 'usr_gh_privacy', 'privacy-officer', 'active', 1) ON CONFLICT(facility_id, user_id) DO NOTHING`);
  run(db, `INSERT INTO consent_subjects (id, organization_id, facility_id, subject_type, display_name) VALUES (?, 'org_demo_gh', 'fac_gh_accra', 'synthetic-subject', 'Akua Boateng') ON CONFLICT(id) DO NOTHING`, SUBJECT_AKUA);
  run(db, `INSERT INTO consent_subjects (id, organization_id, facility_id, subject_type, display_name) VALUES ('sub_eu_synthetic', 'org_demo_eu', 'fac_eu_northbridge', 'synthetic-subject', 'Synthetic EU subject') ON CONFLICT(id) DO NOTHING`);
  const policies = [
    ["pol_communication_reminder", "COMMUNICATION", "consent.communication.dispatch", "appointment-reminder", "facility-messenger"],
    ["pol_sharing_outbound", "SHARING", "consent.sharing.release", "synthetic-record", "local-share-sink"],
    ["pol_research_use", "RESEARCH", "consent.research.use", "research-row", "research-workspace"],
  ];
  for (const [id, purpose, action, category, recipient] of policies) {
    run(
      db,
      `INSERT INTO consent_policies (id, purpose, action, resource_category, recipient_class, jurisdiction, version, consent_required) VALUES (?, ?, ?, ?, ?, 'synthetic-development', ?, 1) ON CONFLICT(id) DO NOTHING`,
      id, purpose, action, category, recipient, CONSENT_POLICY_VERSION,
    );
  }
  run(
    db,
    `INSERT INTO consent_authorities (id, organization_id, subject_id, grantor_id, category, evidence_ref, verification_method, verifier_id, status, valid_from, valid_until, scope, version) VALUES ('auth_akua_self', 'org_demo_gh', ?, ?, 'self', 'evidence_self_ack', 'recorded-acknowledgment', NULL, 'unverified', ?, NULL, 'subject', 1) ON CONFLICT(id) DO NOTHING`,
    SUBJECT_AKUA, SUBJECT_AKUA, now,
  );
  run(
    db,
    `INSERT INTO consent_authorities (id, organization_id, subject_id, grantor_id, category, evidence_ref, verification_method, verifier_id, status, valid_from, valid_until, scope, version) VALUES ('auth_akua_guardian', 'org_demo_gh', ?, 'rep_akua_guardian', 'guardian', 'evidence_guardian_order', 'recorded-document', NULL, 'unverified', ?, NULL, 'subject', 1) ON CONFLICT(id) DO NOTHING`,
    SUBJECT_AKUA, now,
  );
  run(db, `INSERT INTO consent_controls (name, value) VALUES ('dependency', 'available') ON CONFLICT(name) DO NOTHING`);
}

export function installConsentGate() {
  registerConsentGate((db, principalId, action, resource: AuthzResource, context: AuthzContext) => {
    const mapped = CONSENT_ACTIONS[action];
    if (!mapped) return null;
    if (process.env.CURASPHERE_ENV === "production" || process.env.CURASPHERE_ENV === "staging") {
      return { allow: false, reason: "consent-environment", policyId: "pol_consent_dev", policyVersion: CONSENT_POLICY_VERSION };
    }
    const recipient = mapped.kind === "communication" ? "facility-messenger" : mapped.kind === "sharing" ? "local-share-sink" : "research-workspace";
    const resourceCategory = mapped.kind === "communication" ? "appointment-reminder" : mapped.kind === "sharing" ? "synthetic-record" : "research-row";
    const evaluation = evaluateConsent(db, {
      userId: principalId,
      organizationId: resource.organizationId ?? "",
      facilityId: resource.facilityId ?? context.activeFacilityId ?? null,
      sessionId: context.sessionId ?? "",
    }, {
      subjectId: resource.id ?? "",
      action,
      purpose: mapped.purpose,
      recipient,
      resourceCategory,
      record: false,
    });
    if (evaluation.result === "allow") return null;
    return { allow: false, reason: evaluation.reason, policyId: "pol_consent_dev", policyVersion: evaluation.policyVersion };
  });
}

export function createConsent(db: AppDatabase, actor: ConsentActor, input: {
  subjectId: string;
  authorityId: string;
  purpose: "COMMUNICATION" | "SHARING" | "RESEARCH";
  action: string;
  resourceCategory: string;
  recipient: string;
  effectiveAt: string;
  expiresAt: string | null;
  decision: "granted" | "refused";
  idempotencyKey: string;
}) {
  requirePermission(db, actor, "consent.record");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey)) throw new ValidationError("invalid", "The idempotency key is not valid.");
  if (!input.effectiveAt || Number.isNaN(Date.parse(input.effectiveAt))) throw new ValidationError("invalid", "The effective date is not valid.");
  if (input.expiresAt && Date.parse(input.expiresAt) <= Date.parse(input.effectiveAt)) throw new ValidationError("invalid", "The effective dates are not valid.");
  const mapped = CONSENT_ACTIONS[input.action];
  if (!mapped || mapped.purpose !== input.purpose) throw new ValidationError("invalid", "That purpose is not configured.");
  const existing = get<{ directive_id: string }>(db, `SELECT directive_id FROM consent_idempotency WHERE organization_id = ? AND idempotency_key = ?`, actor.organizationId, input.idempotencyKey);
  if (existing) return loadDirective(db, actor, existing.directive_id);
  const subject = get<{ id: string; facility_id: string | null; subject_type: string }>(db, `SELECT id, facility_id, subject_type FROM consent_subjects WHERE id = ? AND organization_id = ?`, input.subjectId, actor.organizationId);
  if (!subject) throw new NotFoundError("That consent record is not available.");
  const authority = get<{ id: string; grantor_id: string; status: string; category: string }>(db, `SELECT id, grantor_id, status, category FROM consent_authorities WHERE id = ? AND organization_id = ? AND subject_id = ?`, input.authorityId, actor.organizationId, input.subjectId);
  if (!authority) throw new ValidationError("invalid", "The grantor authority is not recorded.");
  const now = new Date().toISOString();
  const id = `cns_${randomUUID()}`;
  const status = input.decision === "refused" ? "refused" : "pending_verification";
  const row: DirectiveRow = {
    id,
    organization_id: actor.organizationId,
    facility_id: subject.facility_id,
    subject_id: subject.id,
    subject_type: subject.subject_type,
    category: input.purpose.toLowerCase(),
    purpose: input.purpose,
    action: input.action,
    resource_category: input.resourceCategory,
    recipient: input.recipient,
    jurisdiction: "synthetic-development",
    grantor_id: authority.grantor_id,
    authority_id: authority.id,
    verification_status: authority.status,
    decision: input.decision,
    status,
    effective_at: input.effectiveAt,
    expires_at: input.expiresAt,
    version: 1,
    created_at: now,
    updated_at: now,
    correlation_id: actor.sessionId,
  };
  transaction(db, () => {
    run(
      db,
      `INSERT INTO consent_directives (
        id, organization_id, facility_id, subject_id, subject_type, category, purpose, action, resource_category, recipient,
        jurisdiction, grantor_id, authority_id, verification_status, decision, status, effective_at, expires_at, version,
        created_at, updated_at, correlation_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row.id, row.organization_id, row.facility_id, row.subject_id, row.subject_type, row.category, row.purpose, row.action,
      row.resource_category, row.recipient, row.jurisdiction, row.grantor_id, row.authority_id, row.verification_status,
      row.decision, row.status, row.effective_at, row.expires_at, row.version, row.created_at, row.updated_at, row.correlation_id,
    );
    run(db, `INSERT INTO consent_idempotency (organization_id, idempotency_key, directive_id, created_at) VALUES (?, ?, ?, ?)`, actor.organizationId, input.idempotencyKey, id, now);
    writeVersion(db, row, actor, "created", input.decision === "refused" ? "refused" : "recorded");
    ledger(db, actor, "consent.create", id, subject.id, "success");
    count(db, input.decision === "refused" ? "refused" : "created");
  });
  return row;
}

export function verifyAuthority(db: AppDatabase, actor: ConsentActor, authorityId: string, evidenceRef: string) {
  requirePermission(db, actor, "consent.verify");
  const authority = get<{ id: string; subject_id: string; evidence_ref: string; version: number; status: string; organization_id: string }>(db, `SELECT id, subject_id, evidence_ref, version, status, organization_id FROM consent_authorities WHERE id = ?`, authorityId);
  if (!authority || authority.organization_id !== actor.organizationId) throw new NotFoundError("That consent record is not available.");
  if (evidenceRef !== authority.evidence_ref || !ALLOWED_EVIDENCE.has(evidenceRef)) {
    run(db, `UPDATE consent_authorities SET status = 'rejected', verifier_id = ?, version = version + 1 WHERE id = ? AND version = ?`, actor.userId, authorityId, authority.version);
    count(db, "verification_failed");
    throw new ValidationError("invalid", "The authority evidence was not verified.");
  }
  const updated = run(db, `UPDATE consent_authorities SET status = 'verified', verifier_id = ?, version = version + 1 WHERE id = ? AND version = ? AND status = 'unverified'`, actor.userId, authorityId, authority.version);
  if (updated.changes !== 1 && authority.status !== "verified") throw new ConflictError("conflict", "The authority record changed.");
  run(db, `UPDATE consent_directives SET verification_status = 'verified', updated_at = ? WHERE authority_id = ? AND organization_id = ? AND status = 'pending_verification'`, new Date().toISOString(), authorityId, actor.organizationId);
  count(db, "verified");
  ledger(db, actor, "consent.verify", authorityId, authority.subject_id, "success");
  return { id: authorityId, status: "verified" };
}

export function activateConsent(db: AppDatabase, actor: ConsentActor, id: string, expectedVersion: number) {
  requirePermission(db, actor, "consent.manage");
  return transaction(db, () => {
    const row = loadDirective(db, actor, id);
    if (row.version !== expectedVersion) throw new ConflictError("conflict", "The consent record changed.");
    if (row.status === "withdrawn") throw new ConflictError("conflict", "A withdrawn consent cannot be reactivated.");
    if (row.status !== "pending_verification" || row.decision !== "granted") throw new ConflictError("conflict", "That consent is not ready to activate.");
    const authority = get<{ status: string }>(db, `SELECT status FROM consent_authorities WHERE id = ?`, row.authority_id);
    if (authority?.status !== "verified") throw new ForbiddenError("forbidden", "The grantor authority is not verified.");
    const now = new Date().toISOString();
    const next = { ...row, status: "active", verification_status: "verified", version: row.version + 1, updated_at: now };
    const changed = run(db, `UPDATE consent_directives SET status = 'active', verification_status = 'verified', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = 'pending_verification'`, now, id, expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The consent record changed.");
    writeVersion(db, next, actor, "activated", "granted");
    ledger(db, actor, "consent.activate", id, row.subject_id, "success");
    count(db, "activated");
    db.prepare(`DELETE FROM consent_cache WHERE cache_key LIKE ?`).run(`${row.organization_id}|${row.subject_id}|%`);
    return next;
  });
}

export function withdrawConsent(db: AppDatabase, actor: ConsentActor, id: string, expectedVersion: number, idempotencyKey: string, reasonCode = "subject-request") {
  requirePermission(db, actor, "consent.withdraw");
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(idempotencyKey)) throw new ValidationError("invalid", "The idempotency key is not valid.");
  if (!["subject-request", "representative-request"].includes(reasonCode)) throw new ValidationError("invalid", "The withdrawal reason is not valid.");
  return transaction(db, () => {
    const row = loadDirective(db, actor, id);
    const prior = get<{ id: string; applied_version: number }>(db, `SELECT id, applied_version FROM consent_withdrawals WHERE consent_id = ? AND idempotency_key = ?`, id, idempotencyKey);
    if (prior) return { withdrawalId: prior.id, status: "withdrawn" as const, version: prior.applied_version, idempotent: true };
    const existing = get<{ id: string; applied_version: number }>(db, `SELECT id, applied_version FROM consent_withdrawals WHERE consent_id = ? ORDER BY requested_at LIMIT 1`, id);
    if (row.status === "withdrawn" && existing) return { withdrawalId: existing.id, status: "withdrawn" as const, version: existing.applied_version, idempotent: true };
    if (row.version !== expectedVersion) throw new ConflictError("conflict", "The consent record changed.");
    if (row.status !== "active") throw new ConflictError("conflict", "That consent cannot be withdrawn.");
    const authority = get<{ status: string }>(db, `SELECT status FROM consent_authorities WHERE id = ?`, row.authority_id);
    if (authority?.status !== "verified") throw new ForbiddenError("forbidden", "The withdrawal authority is not verified.");
    const now = new Date().toISOString();
    const nextVersion = row.version + 1;
    const changed = run(db, `UPDATE consent_directives SET status = 'withdrawn', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = 'active'`, now, id, expectedVersion);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The consent record changed.");
    const withdrawalId = `wd_${randomUUID()}`;
    run(
      db,
      `INSERT INTO consent_withdrawals (id, consent_id, prior_version, requester_id, authority_id, reason_code, effective_at, requested_at, status, applied_version, correlation_id, idempotency_key) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'applied', ?, ?, ?)`,
      withdrawalId, id, row.version, actor.userId, row.authority_id, reasonCode, now, now, nextVersion, actor.sessionId, idempotencyKey,
    );
    writeVersion(db, { ...row, status: "withdrawn", version: nextVersion, updated_at: now }, actor, "withdrawn", reasonCode);
    run(db, `UPDATE consent_dispatches SET status = 'blocked', reason_code = 'consent-withdrawn', decided_at = ? WHERE organization_id = ? AND subject_id = ? AND action = ? AND status = 'queued'`, now, row.organization_id, row.subject_id, row.action);
    db.prepare(`DELETE FROM consent_cache WHERE cache_key LIKE ?`).run(`${row.organization_id}|${row.subject_id}|%`);
    ledger(db, actor, "consent.withdraw", id, row.subject_id, "success");
    count(db, "withdrawn");
    count(db, "dispatch_blocked");
    return { withdrawalId, status: "withdrawn" as const, version: nextVersion, idempotent: false };
  });
}

export function supersedeConsent(db: AppDatabase, actor: ConsentActor, id: string, expectedVersion: number, idempotencyKey: string) {
  requirePermission(db, actor, "consent.manage");
  const row = loadDirective(db, actor, id);
  if (row.version !== expectedVersion) throw new ConflictError("conflict", "The consent record changed.");
  if (row.status !== "active") throw new ConflictError("conflict", "That consent cannot be superseded.");
  const now = new Date().toISOString();
  const changed = run(db, `UPDATE consent_directives SET status = 'superseded', version = version + 1, updated_at = ? WHERE id = ? AND version = ? AND status = 'active'`, now, id, expectedVersion);
  if (changed.changes !== 1) throw new ConflictError("conflict", "The consent record changed.");
  writeVersion(db, { ...row, status: "superseded", version: row.version + 1, updated_at: now }, actor, "superseded", "replaced");
  count(db, "superseded");
  return createConsent(db, actor, {
    subjectId: row.subject_id,
    authorityId: row.authority_id,
    purpose: row.purpose as "COMMUNICATION" | "SHARING" | "RESEARCH",
    action: row.action,
    resourceCategory: row.resource_category,
    recipient: row.recipient,
    effectiveAt: now,
    expiresAt: row.expires_at,
    decision: "granted",
    idempotencyKey,
  });
}

export function evaluateConsent(db: AppDatabase, actor: ConsentActor, input: {
  subjectId: string;
  action: string;
  purpose: string;
  recipient: string;
  resourceCategory: string;
  record?: boolean;
}): ConsentEvaluation {
  if (actor.sessionId) {
    const access = effectivePermissions(db, actor.userId, actor.organizationId, actor.facilityId);
    if (!access.permissions.includes("consent.policy.evaluate") && !access.permissions.includes(input.action)) {
      return { result: "deny", reason: "permission", directiveId: null, version: null, policyVersion: CONSENT_POLICY_VERSION };
    }
  }
  if (!dependencyOpen(db)) {
    count(db, "evaluation_failure");
    return { result: "error", reason: "consent-unavailable", directiveId: null, version: null, policyVersion: CONSENT_POLICY_VERSION };
  }
  const policy = get<{ version: number; purpose: string; recipient_class: string; resource_category: string }>(db, `SELECT version, purpose, recipient_class, resource_category FROM consent_policies WHERE action = ? AND version = ?`, input.action, CONSENT_POLICY_VERSION);
  if (!policy) return { result: "not_applicable", reason: "consent-not-required", directiveId: null, version: null, policyVersion: CONSENT_POLICY_VERSION };
  if (policy.purpose !== input.purpose) {
    count(db, "processing_denied");
    return { result: "deny", reason: "consent-purpose", directiveId: null, version: null, policyVersion: policy.version };
  }
  const subject = get<{ id: string }>(db, `SELECT id FROM consent_subjects WHERE id = ? AND organization_id = ?`, input.subjectId, actor.organizationId);
  if (!subject) return { result: "deny", reason: "subject-scope", directiveId: null, version: null, policyVersion: policy.version };
  const directive = get<DirectiveRow>(
    db,
    `SELECT * FROM consent_directives WHERE organization_id = ? AND subject_id = ? AND action = ? AND purpose = ? AND status IN ('active','withdrawn','expired') ORDER BY version DESC LIMIT 1`,
    actor.organizationId, input.subjectId, input.action, input.purpose,
  );
  const cacheKey = `${actor.organizationId}|${input.subjectId}|${input.action}|${input.purpose}|${input.recipient}`;
  const cached = get<{ directive_version: number; result: string; reason_code: string }>(db, `SELECT directive_version, result, reason_code FROM consent_cache WHERE cache_key = ?`, cacheKey);
  if (cached && directive && cached.directive_version === directive.version && cached.result === "allow" && directive.status === "active") {
    return { result: "allow", reason: cached.reason_code, directiveId: directive.id, version: directive.version, policyVersion: policy.version };
  }
  let result: ConsentEvaluation = { result: "deny", reason: "consent-missing", directiveId: directive?.id ?? null, version: directive?.version ?? null, policyVersion: policy.version };
  if (directive?.status === "withdrawn") result = { ...result, reason: "consent-withdrawn" };
  else if (directive?.status === "expired") result = { ...result, reason: "consent-expired" };
  else if (directive?.status === "active") {
    const now = Date.now();
    if (directive.expires_at && Date.parse(directive.expires_at) <= now) {
      run(db, `UPDATE consent_directives SET status = 'expired', version = version + 1, updated_at = ? WHERE id = ? AND status = 'active'`, new Date().toISOString(), directive.id);
      count(db, "expired");
      result = { result: "deny", reason: "consent-expired", directiveId: directive.id, version: directive.version + 1, policyVersion: policy.version };
    } else if (directive.effective_at && Date.parse(directive.effective_at) > now) result = { ...result, reason: "consent-not-effective" };
    else if (directive.verification_status !== "verified" || directive.decision !== "granted") result = { ...result, reason: "consent-unverified" };
    else if (directive.facility_id && actor.facilityId && directive.facility_id !== actor.facilityId) result = { ...result, reason: "facility-scope" };
    else if (input.recipient !== directive.recipient && input.recipient !== policy.recipient_class) result = { ...result, reason: "recipient-scope" };
    else if (input.resourceCategory !== directive.resource_category && input.resourceCategory !== policy.resource_category) result = { ...result, reason: "resource-scope" };
    else result = { result: "allow", reason: "consent-granted", directiveId: directive.id, version: directive.version, policyVersion: policy.version };
  }
  if (directive && result.version !== null) {
    run(
      db,
      `INSERT INTO consent_cache (cache_key, directive_version, result, reason_code) VALUES (?, ?, ?, ?) ON CONFLICT(cache_key) DO UPDATE SET directive_version = excluded.directive_version, result = excluded.result, reason_code = excluded.reason_code`,
      cacheKey, result.version, result.result, result.reason,
    );
  }
  count(db, result.result === "allow" ? "processing_allowed" : result.result === "error" ? "evaluation_failure" : "processing_denied");
  if (input.record !== false && actor.sessionId) ledger(db, actor, "consent.evaluate", directive?.id ?? null, input.subjectId, result.result === "allow" ? "success" : "denied");
  return result;
}

export function queueConsentDispatch(db: AppDatabase, actor: ConsentActor, input: { subjectId: string; action: string; recipient: string; resourceCategory: string; idempotencyKey: string }) {
  const mapped = CONSENT_ACTIONS[input.action];
  if (!mapped) throw new ValidationError("invalid", "That processing action is not configured.");
  requirePermission(db, actor, input.action);
  if (process.env.CURASPHERE_ENV === "production" || process.env.CURASPHERE_ENV === "staging") throw new ForbiddenError("forbidden", "Consent-dependent processing is disabled outside the local sandbox.");
  const existing = get<{ id: string; status: string }>(db, `SELECT id, status FROM consent_dispatches WHERE organization_id = ? AND idempotency_key = ?`, actor.organizationId, input.idempotencyKey);
  if (existing) return existing;
  const decision = evaluateConsent(db, actor, { subjectId: input.subjectId, action: input.action, purpose: mapped.purpose, recipient: input.recipient, resourceCategory: input.resourceCategory });
  if (decision.result === "error") throw new ConflictError("conflict", "Consent status could not be verified.");
  if (decision.result !== "allow") throw new ForbiddenError("forbidden", "Consent does not allow this processing.");
  const id = `dsp_${randomUUID()}`;
  run(
    db,
    `INSERT INTO consent_dispatches (id, organization_id, facility_id, subject_id, kind, purpose, action, recipient, resource_category, status, directive_id, directive_version, reason_code, idempotency_key, created_at, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', ?, ?, NULL, ?, ?, NULL)`,
    id, actor.organizationId, actor.facilityId, input.subjectId, mapped.kind, mapped.purpose, input.action, input.recipient, input.resourceCategory, decision.directiveId, decision.version, input.idempotencyKey, new Date().toISOString(),
  );
  return { id, status: "queued" };
}

export function dispatchConsentJob(db: AppDatabase, actor: ConsentActor, id: string) {
  requirePermission(db, actor, "consent.manage");
  return transaction(db, () => {
    const job = get<{ id: string; organization_id: string; subject_id: string; action: string; purpose: string; recipient: string; resource_category: string; status: string }>(db, `SELECT * FROM consent_dispatches WHERE id = ?`, id);
    if (!job || job.organization_id !== actor.organizationId) throw new NotFoundError("That consent record is not available.");
    if (job.status === "dispatched" || job.status === "blocked") return { id: job.id, status: job.status, reason: job.status };
    const decision = evaluateConsent(db, actor, { subjectId: job.subject_id, action: job.action, purpose: job.purpose, recipient: job.recipient, resourceCategory: job.resource_category });
    const now = new Date().toISOString();
    if (decision.result !== "allow") {
      run(db, `UPDATE consent_dispatches SET status = 'blocked', reason_code = ?, decided_at = ? WHERE id = ? AND status = 'queued'`, decision.reason, now, id);
      count(db, "dispatch_blocked");
      ledger(db, actor, "consent.dispatch", id, job.subject_id, "denied");
      return { id, status: "blocked", reason: decision.reason };
    }
    const changed = run(db, `UPDATE consent_dispatches SET status = 'dispatched', reason_code = 'consent-granted', decided_at = ? WHERE id = ? AND status = 'queued'`, now, id);
    if (changed.changes !== 1) throw new ConflictError("conflict", "The queued operation changed.");
    run(db, `INSERT INTO consent_sink (id, dispatch_id, delivered_at) VALUES (?, ?, ?)`, randomUUID(), id, now);
    ledger(db, actor, "consent.dispatch", id, job.subject_id, "success");
    return { id, status: "dispatched", reason: "consent-granted" };
  });
}

export function consentOverview(db: AppDatabase, actor: ConsentActor) {
  requirePermission(db, actor, "consent.read");
  const rows = all<{ status: string; c: number }>(db, `SELECT status, COUNT(*) AS c FROM consent_directives WHERE organization_id = ? GROUP BY status`, actor.organizationId);
  const counts = Object.fromEntries(rows.map((row) => [row.status, row.c]));
  return { total: rows.reduce((sum, row) => sum + row.c, 0), active: counts.active ?? 0, pending: counts.pending_verification ?? 0, withdrawn: counts.withdrawn ?? 0, expired: counts.expired ?? 0, awaitingVerification: counts.pending_verification ?? 0 };
}

export function listConsents(db: AppDatabase, actor: ConsentActor, filter: { status?: string; purpose?: string; subjectId?: string } = {}) {
  requirePermission(db, actor, "consent.read");
  const clauses = ["organization_id = ?"];
  const params: Array<string | null> = [actor.organizationId];
  if (actor.facilityId) {
    clauses.push("(facility_id IS NULL OR facility_id = ?)");
    params.push(actor.facilityId);
  }
  if (filter.status) { clauses.push("status = ?"); params.push(filter.status); }
  if (filter.purpose) { clauses.push("purpose = ?"); params.push(filter.purpose); }
  if (filter.subjectId) { clauses.push("subject_id = ?"); params.push(filter.subjectId); }
  return all<DirectiveRow>(db, `SELECT * FROM consent_directives WHERE ${clauses.join(" AND ")} ORDER BY updated_at DESC LIMIT 100`, ...params);
}

export function readConsent(db: AppDatabase, actor: ConsentActor, id: string) {
  requirePermission(db, actor, "consent.read");
  return loadDirective(db, actor, id);
}

export function consentHistory(db: AppDatabase, actor: ConsentActor, id: string) {
  requirePermission(db, actor, "consent.history.read");
  const row = loadDirective(db, actor, id);
  return all<{ version: number; change_code: string; actor_id: string; reason_code: string; recorded_at: string; snapshot_hash: string }>(db, `SELECT version, change_code, actor_id, reason_code, recorded_at, snapshot_hash FROM consent_versions WHERE consent_id = ? ORDER BY version`, row.id);
}

export function listConsentDispatches(db: AppDatabase, actor: ConsentActor, subjectId: string) {
  requirePermission(db, actor, "consent.read");
  return all<{ id: string; status: string; reason_code: string | null; action: string }>(
    db,
    `SELECT id, status, reason_code, action FROM consent_dispatches WHERE organization_id = ? AND subject_id = ? ORDER BY created_at`,
    actor.organizationId,
    subjectId,
  );
}

export function listConsentSubjects(db: AppDatabase, actor: ConsentActor) {
  requirePermission(db, actor, "consent.read");
  return all<{ id: string; display_name: string; facility_id: string | null }>(db, `SELECT id, display_name, facility_id FROM consent_subjects WHERE organization_id = ?`, actor.organizationId);
}

export function setConsentDependency(db: AppDatabase, value: "available" | "unavailable") {
  run(db, `INSERT INTO consent_controls (name, value) VALUES ('dependency', ?) ON CONFLICT(name) DO UPDATE SET value = ?`, value, value);
}

export const CONSENT_ROLLBACK = `
DROP TRIGGER IF EXISTS consent_versions_no_delete;
DROP TRIGGER IF EXISTS consent_versions_no_update;
DROP TABLE IF EXISTS consent_cache;
DROP TABLE IF EXISTS consent_sink;
DROP TABLE IF EXISTS consent_dispatches;
DROP TABLE IF EXISTS consent_withdrawals;
DROP TABLE IF EXISTS consent_versions;
DROP TABLE IF EXISTS consent_directives;
DROP TABLE IF EXISTS consent_authorities;
DROP TABLE IF EXISTS consent_policies;
DROP TABLE IF EXISTS consent_subjects;
DROP TABLE IF EXISTS consent_controls;
DROP TABLE IF EXISTS consent_idempotency;
DROP TABLE IF EXISTS retention_job_items;
DROP TABLE IF EXISTS retention_jobs;
DROP TABLE IF EXISTS retention_plan_items;
DROP TABLE IF EXISTS retention_dry_runs;
DROP TABLE IF EXISTS legal_hold_resources;
DROP TABLE IF EXISTS legal_holds;
DROP TABLE IF EXISTS retention_archives;
DROP TABLE IF EXISTS retention_tombstones;
DROP TABLE IF EXISTS retention_records;
DROP TABLE IF EXISTS retention_policy_versions;
DROP TABLE IF EXISTS retention_policies;
DROP TABLE IF EXISTS retention_controls;
DROP TABLE IF EXISTS privacy_alerts;
DROP TABLE IF EXISTS privacy_erasure_plans;
DROP TABLE IF EXISTS privacy_tombstones;
DROP TABLE IF EXISTS privacy_manifests;
DROP TABLE IF EXISTS privacy_artifacts;
DROP TABLE IF EXISTS privacy_export_items;
DROP TABLE IF EXISTS privacy_exports;
DROP TABLE IF EXISTS privacy_reviews;
DROP TABLE IF EXISTS privacy_verifications;
DROP TABLE IF EXISTS privacy_requests;
DROP TABLE IF EXISTS privacy_record_versions;
DROP TABLE IF EXISTS privacy_records;
DROP TABLE IF EXISTS privacy_authorities;
DROP TABLE IF EXISTS privacy_subjects;
DROP TABLE IF EXISTS privacy_policies;
DROP TABLE IF EXISTS privacy_revoked_sessions;
DROP TABLE IF EXISTS privacy_controls;
DELETE FROM schema_migrations WHERE version IN (34, 35, 36, 37, 38, 39, 40, 41, 42, 43);
INSERT OR IGNORE INTO schema_migrations (version) VALUES (33);
`;
