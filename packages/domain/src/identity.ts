import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { Secret, TOTP } from "otpauth";
import { writeAudit } from "./audit";
import type { AppDatabase } from "./db";
import { get, run, transaction } from "./db";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { closeSession, openSession } from "./session";

export const LOCAL_ISSUER = "http://127.0.0.1:15556/dex";
export const LOCAL_AUDIENCE = "curasphere-local";
export const LOCAL_REDIRECT = "http://localhost:3000/api/auth/callback";

export function dexLocalSubject(userId: string) {
  const user = Buffer.from(userId);
  const connector = Buffer.from("local");
  return Buffer.concat([Buffer.from([0x0a, user.length]), user, Buffer.from([0x12, connector.length]), connector]).toString("base64url");
}
const IDLE_MS = 30 * 60 * 1000;
const ABSOLUTE_MS = 12 * 60 * 60 * 1000;
const FLOW_MS = 10 * 60 * 1000;
const PENDING_MS = 5 * 60 * 1000;

export function subjectHash(subject: string) {
  return createHash("sha256").update(subject).digest("hex");
}

function hashToken(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

export function countAuth(db: AppDatabase, name: string) {
  run(
    db,
    `INSERT INTO auth_counters (name, value) VALUES (?, 1)
     ON CONFLICT(name) DO UPDATE SET value = value + 1`,
    name,
  );
}

export function authCount(db: AppDatabase, name: string) {
  return get<{ value: number }>(db, "SELECT value FROM auth_counters WHERE name = ?", name)?.value ?? 0;
}

export function recordAuthEvent(
  db: AppDatabase,
  action: string,
  outcome: "success" | "denied" | "not_found" | "conflict",
  subject: string | null,
  correlationId: string | null = null,
  durationMs: number | null = null,
) {
  run(
    db,
    `INSERT INTO auth_events (id, action, outcome, subject_hash, correlation_id, duration_ms, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    action,
    outcome,
    subject ? subjectHash(subject) : null,
    correlationId,
    durationMs,
    new Date().toISOString(),
  );
}

export function seedIdentityLinks(db: AppDatabase) {
  run(
    db,
    `INSERT INTO identity_providers (issuer, audience) VALUES (?, ?)
     ON CONFLICT(issuer) DO UPDATE SET audience = excluded.audience`,
    LOCAL_ISSUER,
    LOCAL_AUDIENCE,
  );
  const links = [
    ["ext_amira", dexLocalSubject("usr_amira"), "usr_amira", "amira.solano@harborlight.invalid"],
    ["ext_nurse", dexLocalSubject("usr_gh_nurse"), "usr_gh_nurse", "akosua.owusu@demo-gh.invalid"],
    ["ext_marta", dexLocalSubject("usr_eu_admin"), "usr_eu_admin", "marta.keller@demo-eu.invalid"],
    ["ext_same_email", "sub_same_email", "usr_gh_admin", "amira.solano@harborlight.invalid"],
  ] as const;
  for (const [id, subject, userId, email] of links) {
    const user = get<{ id: string }>(db, "SELECT id FROM users WHERE id = ?", userId);
    if (!user) continue;
    run(
      db,
      `INSERT INTO external_identities (id, issuer, subject, user_id, email, status)
       VALUES (?, ?, ?, ?, ?, 'active')
       ON CONFLICT(issuer, subject) DO NOTHING`,
      id,
      LOCAL_ISSUER,
      subject,
      userId,
      email,
    );
  }
}

export function beginAuthTransaction(db: AppDatabase, input: { state: string; nonce: string; codeVerifier: string; redirectUri: string }) {
  if (input.redirectUri !== LOCAL_REDIRECT) {
    throw new ValidationError("invalid", "That return address is not allowed.");
  }
  const id = randomUUID();
  const now = new Date();
  run(
    db,
    `INSERT INTO auth_transactions (id, state, nonce, code_verifier, redirect_uri, created_at, expires_at, consumed_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, NULL)`,
    id,
    input.state,
    input.nonce,
    input.codeVerifier,
    input.redirectUri,
    now.toISOString(),
    new Date(now.getTime() + FLOW_MS).toISOString(),
  );
  countAuth(db, "auth_started");
  return id;
}

export function readAuthTransaction(db: AppDatabase, id: string) {
  const row = get<{
    id: string;
    state: string;
    nonce: string;
    code_verifier: string;
    redirect_uri: string;
    expires_at: string;
    consumed_at: string | null;
  }>(
    db,
    `SELECT id, state, nonce, code_verifier, redirect_uri, expires_at, consumed_at FROM auth_transactions WHERE id = ?`,
    id,
  );
  if (!row || row.consumed_at || row.expires_at <= new Date().toISOString()) {
    recordAuthEvent(db, "auth.callback", "denied", null, id || null);
    countAuth(db, "login_failure");
    throw new AppError("expired", "That sign-in attempt expired. Start again.");
  }
  return row;
}

export function consumeAuthTransaction(db: AppDatabase, id: string) {
  const updated = db.prepare(`UPDATE auth_transactions SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL`).run(new Date().toISOString(), id);
  if (updated.changes !== 1) {
    recordAuthEvent(db, "auth.replay", "denied", null);
    countAuth(db, "login_failure");
    throw new ConflictError("conflict", "That sign-in attempt was already used.");
  }
}

export type LoginDecision =
  | { status: "session"; userId: string; assurance: "password" }
  | { status: "mfa"; pendingId: string; userId: string; methods: Array<"totp" | "passkey"> }
  | { status: "pending" };

export function decideExternalLogin(db: AppDatabase, issuer: string, subject: string, refreshToken: string | null = null): LoginDecision {
  if (issuer !== LOCAL_ISSUER) {
    recordAuthEvent(db, "auth.issuer", "denied", subject);
    countAuth(db, "login_failure");
    throw new ForbiddenError("tenant", "That identity provider is not accepted.");
  }
  const link = get<{ user_id: string; status: string; email: string | null }>(
    db,
    `SELECT user_id, status, email FROM external_identities WHERE issuer = ? AND subject = ?`,
    issuer,
    subject,
  );
  if (!link || link.status !== "active") {
    recordAuthEvent(db, "auth.unknown", "not_found", subject);
    countAuth(db, "login_failure");
    return { status: "pending" };
  }
  const member = get<{ status: string; org_status: string }>(
    db,
    `SELECT m.status, o.status AS org_status
     FROM organization_memberships m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active'
     LIMIT 1`,
    link.user_id,
  );
  if (!member) {
    recordAuthEvent(db, "auth.membership", "denied", subject);
    countAuth(db, "login_failure");
    throw new ForbiddenError("closed", "This account cannot enter an organization.");
  }
  const methods = mfaMethods(db, link.user_id);
  if (methods.length > 0) {
    const pendingId = randomUUID();
    const now = new Date();
    run(
      db,
      `INSERT INTO pending_logins (id, user_id, issuer, subject, created_at, expires_at, consumed_at, refresh_token)
       VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      pendingId,
      link.user_id,
      issuer,
      subject,
      now.toISOString(),
      new Date(now.getTime() + PENDING_MS).toISOString(),
      refreshToken,
    );
    recordAuthEvent(db, "auth.mfa", "success", subject);
    return { status: "mfa", pendingId, userId: link.user_id, methods };
  }
  recordAuthEvent(db, "auth.login", "success", subject);
  countAuth(db, "login_success");
  return { status: "session", userId: link.user_id, assurance: "password" };
}

function mfaMethods(db: AppDatabase, userId: string) {
  const methods: Array<"totp" | "passkey"> = [];
  const totp = get<{ status: string }>(db, "SELECT status FROM totp_credentials WHERE user_id = ?", userId);
  if (totp?.status === "active") methods.push("totp");
  const passkey = get<{ c: number }>(
    db,
    "SELECT COUNT(*) AS c FROM webauthn_credentials WHERE user_id = ? AND status = 'active'",
    userId,
  );
  if ((passkey?.c ?? 0) > 0) methods.push("passkey");
  return methods;
}

export function bindAuthSession(db: AppDatabase, input: { sessionId: string; userId: string; issuer: string; subject: string; assurance: string; refreshToken: string | null }) {
  const now = new Date();
  run(
    db,
    `INSERT INTO auth_sessions
      (id, session_id, user_id, issuer, subject, assurance, created_at, absolute_expires_at, idle_expires_at, revoked_at, refresh_token, refresh_current_hash, refresh_previous_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
    randomUUID(),
    input.sessionId,
    input.userId,
    input.issuer,
    input.subject,
    input.assurance,
    now.toISOString(),
    new Date(now.getTime() + ABSOLUTE_MS).toISOString(),
    new Date(now.getTime() + IDLE_MS).toISOString(),
    input.refreshToken,
    input.refreshToken ? hashToken(input.refreshToken) : null,
  );
  countAuth(db, "session_created");
}

export function openLocalIdentitySession(db: AppDatabase, input: { userId: string; issuer: string; subject: string; assurance: string; refreshToken: string | null }) {
  const opened = openSession(db, input.userId);
  bindAuthSession(db, { sessionId: opened.sessionId, ...input });
  return opened.sessionId;
}

export function readBoundSession(db: AppDatabase, sessionId: string) {
  const row = get<{
    user_id: string;
    revoked_at: string | null;
    absolute_expires_at: string;
    idle_expires_at: string;
    subject: string;
  }>(
    db,
    `SELECT user_id, revoked_at, absolute_expires_at, idle_expires_at, subject FROM auth_sessions WHERE session_id = ?`,
    sessionId,
  );
  if (!row) return null;
  const now = new Date().toISOString();
  if (row.revoked_at || row.absolute_expires_at <= now || row.idle_expires_at <= now) {
    return { active: false as const, userId: row.user_id };
  }
  const member = get<{ status: string }>(
    db,
    `SELECT m.status FROM organization_memberships m
     JOIN organizations o ON o.id = m.organization_id
     WHERE m.user_id = ? AND m.status = 'active' AND o.status = 'active' LIMIT 1`,
    row.user_id,
  );
  if (!member) return { active: false as const, userId: row.user_id };
  run(db, `UPDATE auth_sessions SET idle_expires_at = ? WHERE session_id = ?`, new Date(Date.now() + IDLE_MS).toISOString(), sessionId);
  return { active: true as const, userId: row.user_id };
}

export function revokeAuthSession(db: AppDatabase, sessionId: string) {
  run(db, `UPDATE auth_sessions SET revoked_at = ?, refresh_token = NULL WHERE session_id = ? AND revoked_at IS NULL`, new Date().toISOString(), sessionId);
  countAuth(db, "session_revoked");
  recordAuthEvent(db, "auth.logout", "success", null);
}

export function revokeUserSessions(db: AppDatabase, userId: string) {
  const rows = db.prepare("SELECT session_id FROM auth_sessions WHERE user_id = ? AND revoked_at IS NULL").all(userId) as Array<{ session_id: string }>;
  run(db, `UPDATE auth_sessions SET revoked_at = ?, refresh_token = NULL WHERE user_id = ? AND revoked_at IS NULL`, new Date().toISOString(), userId);
  for (const row of rows) closeSession(db, row.session_id);
  countAuth(db, "session_revoked");
}

export function rotateRefreshToken(db: AppDatabase, sessionId: string, presented: string, next: string | null) {
  const row = get<{ refresh_current_hash: string | null; refresh_previous_hash: string | null; revoked_at: string | null }>(
    db,
    `SELECT refresh_current_hash, refresh_previous_hash, revoked_at FROM auth_sessions WHERE session_id = ?`,
    sessionId,
  );
  if (!row || row.revoked_at) {
    countAuth(db, "refresh_replay");
    throw new ForbiddenError("tenant", "That session is no longer active.");
  }
  const presentedHash = hashToken(presented);
  if (row.refresh_previous_hash && safeEqual(presentedHash, row.refresh_previous_hash)) {
    revokeAuthSession(db, sessionId);
    countAuth(db, "refresh_replay");
    recordAuthEvent(db, "auth.refresh", "denied", null);
    throw new ForbiddenError("tenant", "That sign-in was reused and has been revoked.");
  }
  if (!row.refresh_current_hash || !safeEqual(presentedHash, row.refresh_current_hash)) {
    recordAuthEvent(db, "auth.refresh", "denied", null);
    throw new ForbiddenError("tenant", "That sign-in could not be renewed.");
  }
  run(
    db,
    `UPDATE auth_sessions SET refresh_previous_hash = refresh_current_hash, refresh_current_hash = ?, refresh_token = ? WHERE session_id = ?`,
    next ? hashToken(next) : null,
    next,
    sessionId,
  );
  recordAuthEvent(db, "auth.refresh", "success", null);
}

function safeEqual(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export function readTotpStatus(db: AppDatabase, userId: string) {
  return get<{ status: string }>(db, "SELECT status FROM totp_credentials WHERE user_id = ?", userId)?.status ?? "missing";
}

export function enrollTotp(db: AppDatabase, userId: string) {
  const secret = new Secret({ size: 20 });
  const recovery = Array.from({ length: 8 }, () => randomBytes(5).toString("hex"));
  run(
    db,
    `INSERT INTO totp_credentials (id, user_id, secret, status, failures, locked_until, recovery_hashes)
     VALUES (?, ?, ?, 'pending', 0, NULL, ?)
     ON CONFLICT(user_id) DO UPDATE SET secret = excluded.secret, status = 'pending', failures = 0, locked_until = NULL, recovery_hashes = excluded.recovery_hashes`,
    randomUUID(),
    userId,
    secret.base32,
    recovery.map((code) => hashToken(code)).join(","),
  );
  recordAuthEvent(db, "mfa.enroll", "success", userId);
  return { secret: secret.base32, recovery };
}

export function confirmTotp(db: AppDatabase, userId: string, code: string) {
  const row = get<{ secret: string; status: string }>(db, "SELECT secret, status FROM totp_credentials WHERE user_id = ?", userId);
  if (!row || row.status === "revoked") throw new NotFoundError("No authenticator is waiting.");
  if (!totpMatches(row.secret, code)) {
    recordAuthEvent(db, "mfa.confirm", "denied", userId);
    throw new ValidationError("invalid", "That code was not accepted.");
  }
  run(db, "UPDATE totp_credentials SET status = 'active', failures = 0, locked_until = NULL WHERE user_id = ?", userId);
  recordAuthEvent(db, "mfa.confirm", "success", userId);
}

export function verifyTotp(db: AppDatabase, pendingId: string, code: string) {
  const pending = readPending(db, pendingId);
  const row = get<{ secret: string; status: string; failures: number; locked_until: string | null; recovery_hashes: string }>(
    db,
    "SELECT secret, status, failures, locked_until, recovery_hashes FROM totp_credentials WHERE user_id = ?",
    pending.user_id,
  );
  if (!row || row.status !== "active") throw new ValidationError("invalid", "No authenticator is enrolled.");
  if (row.locked_until && row.locked_until > new Date().toISOString()) {
    countAuth(db, "mfa_failure");
    throw new ForbiddenError("closed", "This authenticator is temporarily locked.");
  }
  const recoveryHit = row.recovery_hashes.split(",").filter(Boolean).find((item) => safeEqual(hashToken(code), item));
  if (!totpMatches(row.secret, code) && !recoveryHit) {
    const failures = row.failures + 1;
    const locked = failures >= 5 ? new Date(Date.now() + 15 * 60 * 1000).toISOString() : null;
    run(db, "UPDATE totp_credentials SET failures = ?, locked_until = ? WHERE user_id = ?", failures, locked, pending.user_id);
    countAuth(db, "mfa_failure");
    recordAuthEvent(db, "mfa.verify", "denied", pending.subject);
    throw new ValidationError("invalid", "That code was not accepted.");
  }
  if (recoveryHit) {
    const remaining = row.recovery_hashes.split(",").filter((item) => item && !safeEqual(hashToken(code), item));
    run(db, "UPDATE totp_credentials SET recovery_hashes = ?, failures = 0, locked_until = NULL WHERE user_id = ?", remaining.join(","), pending.user_id);
  } else {
    run(db, "UPDATE totp_credentials SET failures = 0, locked_until = NULL WHERE user_id = ?", pending.user_id);
  }
  consumePending(db, pendingId);
  recordAuthEvent(db, "mfa.verify", "success", pending.subject);
  countAuth(db, "login_success");
  return pending;
}

export function revokeTotp(db: AppDatabase, userId: string) {
  const updated = db.prepare("UPDATE totp_credentials SET status = 'revoked', secret = '', recovery_hashes = '', failures = 0, locked_until = NULL WHERE user_id = ? AND status != 'revoked'").run(userId);
  if (updated.changes !== 1) throw new NotFoundError("No authenticator is enrolled.");
  recordAuthEvent(db, "mfa.revoke", "success", userId);
}

function totpMatches(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const totp = new TOTP({ issuer: "CuraSphere", label: "workforce", algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(secret) });
  return totp.validate({ token: code, window: 1 }) !== null;
}

export function pendingLoginOpen(db: AppDatabase, pendingId: string) {
  readPending(db, pendingId);
}

export function completePendingLogin(db: AppDatabase, pendingId: string) {
  const pending = readPending(db, pendingId);
  consumePending(db, pendingId);
  return pending;
}

function readPending(db: AppDatabase, pendingId: string) {
  const row = get<{ user_id: string; issuer: string; subject: string; expires_at: string; consumed_at: string | null; refresh_token: string | null }>(
    db,
    "SELECT user_id, issuer, subject, expires_at, consumed_at, refresh_token FROM pending_logins WHERE id = ?",
    pendingId,
  );
  if (!row || row.consumed_at || row.expires_at <= new Date().toISOString()) {
    throw new ValidationError("invalid", "That authenticator challenge expired.");
  }
  return row;
}

function consumePending(db: AppDatabase, pendingId: string) {
  run(db, "UPDATE pending_logins SET consumed_at = ?, refresh_token = NULL WHERE id = ?", new Date().toISOString(), pendingId);
}

export function currentRefreshToken(db: AppDatabase, sessionId: string) {
  return get<{ refresh_token: string | null }>(db, "SELECT refresh_token FROM auth_sessions WHERE session_id = ? AND revoked_at IS NULL", sessionId)?.refresh_token ?? null;
}

export function auditIdentity(db: AppDatabase, userId: string, action: string, outcome: "success" | "denied") {
  const user = get<{ organization_id: string; role: "clinician" | "nurse" | "auditor" | "admin"; display_name: string }>(
    db,
    "SELECT organization_id, role, display_name FROM users WHERE id = ?",
    userId,
  );
  if (!user) return;
  writeAudit(db, {
    sessionId: "identity",
    userId,
    displayName: user.display_name,
    role: user.role,
    purposeOfUse: user.role === "admin" ? "OPERATIONS" : "TREATMENT",
    organizationId: user.organization_id,
    organizationName: user.organization_id,
    facilityId: null,
    facilityName: null,
  }, { action, resourceType: "Identity", resourceId: null, outcome });
}

export function transactionGuard<T>(db: AppDatabase, fn: () => T) {
  return transaction(db, fn);
}
