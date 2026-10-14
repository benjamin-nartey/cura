import { randomUUID } from "node:crypto";
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@simplewebauthn/server";
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from "@simplewebauthn/server";
import type { AppDatabase } from "./db";
import { get, run } from "./db";
import { ValidationError } from "./errors";
import { countAuth, recordAuthEvent } from "./identity";

const RP_ID = "localhost";
const ORIGIN = "http://localhost:3000";

export async function beginPasskeyRegistration(db: AppDatabase, userId: string, displayName: string) {
  const existing = db
    .prepare("SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ? AND status = 'active'")
    .all(userId) as Array<{ credential_id: string; transports: string | null }>;
  const options = await generateRegistrationOptions({
    rpName: "CuraSphere",
    rpID: RP_ID,
    userName: userId,
    userDisplayName: displayName,
    attestationType: "none",
    authenticatorSelection: { residentKey: "preferred", userVerification: "required" },
    excludeCredentials: existing.map((row) => ({
      id: row.credential_id,
      transports: row.transports ? (row.transports.split(",") as Array<"internal" | "hybrid">) : undefined,
    })),
  });
  const id = randomUUID();
  run(
    db,
    `INSERT INTO webauthn_challenges (id, user_id, challenge, kind, expires_at, consumed_at) VALUES (?, ?, ?, 'registration', ?, NULL)`,
    id,
    userId,
    options.challenge,
    new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  );
  return { challengeId: id, options: jsonReady(options) };
}

export async function finishPasskeyRegistration(db: AppDatabase, userId: string, challengeId: string, response: RegistrationResponseJSON) {
  const challenge = takeChallenge(db, challengeId, userId, "registration");
  const verified = await verifyRegistrationResponse({
    response,
    expectedChallenge: challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
  });
  if (!verified.verified || !verified.registrationInfo) {
    recordAuthEvent(db, "passkey.register", "denied", userId);
    throw new ValidationError("invalid", "The passkey was not accepted.");
  }
  const credential = verified.registrationInfo.credential;
  run(
    db,
    `INSERT INTO webauthn_credentials (id, user_id, credential_id, public_key, counter, transports, status)
     VALUES (?, ?, ?, ?, ?, ?, 'active')`,
    randomUUID(),
    userId,
    credential.id,
    Buffer.from(credential.publicKey).toString("base64url"),
    credential.counter,
    credential.transports?.join(",") ?? null,
  );
  recordAuthEvent(db, "passkey.register", "success", userId);
}

export async function beginPasskeyAuthentication(db: AppDatabase, userId: string) {
  const credentials = db
    .prepare("SELECT credential_id, transports FROM webauthn_credentials WHERE user_id = ? AND status = 'active'")
    .all(userId) as Array<{ credential_id: string; transports: string | null }>;
  if (credentials.length === 0) throw new ValidationError("invalid", "No passkey is enrolled.");
  const options = await generateAuthenticationOptions({
    rpID: RP_ID,
    userVerification: "required",
    allowCredentials: credentials.map((row) => ({
      id: row.credential_id,
      transports: row.transports ? (row.transports.split(",") as Array<"internal" | "hybrid">) : undefined,
    })),
  });
  const id = randomUUID();
  run(
    db,
    `INSERT INTO webauthn_challenges (id, user_id, challenge, kind, expires_at, consumed_at) VALUES (?, ?, ?, 'authentication', ?, NULL)`,
    id,
    userId,
    options.challenge,
    new Date(Date.now() + 5 * 60 * 1000).toISOString(),
  );
  return { challengeId: id, options: jsonReady(options) };
}

export async function finishPasskeyAuthentication(db: AppDatabase, challengeId: string, response: AuthenticationResponseJSON) {
  const row = get<{ user_id: string; challenge: string; kind: string; expires_at: string; consumed_at: string | null }>(
    db,
    "SELECT user_id, challenge, kind, expires_at, consumed_at FROM webauthn_challenges WHERE id = ?",
    challengeId,
  );
  if (!row?.user_id || row.kind !== "authentication" || row.consumed_at || row.expires_at <= new Date().toISOString()) {
    throw new ValidationError("invalid", "That passkey challenge expired.");
  }
  const stored = get<{ public_key: string; counter: number; transports: string | null }>(
    db,
    "SELECT public_key, counter, transports FROM webauthn_credentials WHERE credential_id = ? AND user_id = ? AND status = 'active'",
    response.id,
    row.user_id,
  );
  if (!stored) {
    recordAuthEvent(db, "passkey.authenticate", "denied", row.user_id);
    throw new ValidationError("invalid", "That passkey is not enrolled.");
  }
  run(db, "UPDATE webauthn_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL", new Date().toISOString(), challengeId);
  const verified = await verifyAuthenticationResponse({
    response,
    expectedChallenge: row.challenge,
    expectedOrigin: ORIGIN,
    expectedRPID: RP_ID,
    requireUserVerification: true,
    credential: {
      id: response.id,
      publicKey: Buffer.from(stored.public_key, "base64url"),
      counter: stored.counter,
      transports: stored.transports ? (stored.transports.split(",") as Array<"internal" | "hybrid">) : undefined,
    },
  });
  if (!verified.verified) {
    countAuth(db, "mfa_failure");
    recordAuthEvent(db, "passkey.authenticate", "denied", row.user_id);
    throw new ValidationError("invalid", "The passkey was not accepted.");
  }
  run(db, "UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?", verified.authenticationInfo.newCounter, response.id);
  recordAuthEvent(db, "passkey.authenticate", "success", row.user_id);
  return row.user_id;
}

export function listPasskeys(db: AppDatabase, userId: string) {
  return db.prepare("SELECT credential_id, status FROM webauthn_credentials WHERE user_id = ? ORDER BY credential_id").all(userId) as Array<{ credential_id: string; status: string }>;
}

export function revokePasskey(db: AppDatabase, userId: string, credentialId: string) {
  const updated = db.prepare("UPDATE webauthn_credentials SET status = 'revoked' WHERE user_id = ? AND credential_id = ? AND status = 'active'").run(userId, credentialId);
  if (updated.changes !== 1) throw new ValidationError("invalid", "That passkey is not enrolled.");
  recordAuthEvent(db, "passkey.revoke", "success", userId);
}

function jsonReady<T>(value: T): T {
  return JSON.parse(JSON.stringify(value, (_key, item) => (item instanceof Uint8Array ? Buffer.from(item).toString("base64url") : item))) as T;
}

function takeChallenge(db: AppDatabase, id: string, userId: string, kind: string) {
  const row = get<{ challenge: string; user_id: string | null; kind: string; expires_at: string; consumed_at: string | null }>(
    db,
    "SELECT challenge, user_id, kind, expires_at, consumed_at FROM webauthn_challenges WHERE id = ?",
    id,
  );
  if (!row || row.user_id !== userId || row.kind !== kind || row.consumed_at || row.expires_at <= new Date().toISOString()) {
    throw new ValidationError("invalid", "That passkey challenge expired.");
  }
  run(db, "UPDATE webauthn_challenges SET consumed_at = ? WHERE id = ?", new Date().toISOString(), id);
  return row.challenge;
}
