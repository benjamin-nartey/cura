import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { createDatabase } from "../src/db.ts";
import { ConflictError, ForbiddenError, ValidationError } from "../src/errors.ts";
import {
  LOCAL_ISSUER,
  authCount,
  beginAuthTransaction,
  confirmTotp,
  consumeAuthTransaction,
  decideExternalLogin,
  dexLocalSubject,
  enrollTotp,
  openLocalIdentitySession,
  readAuthTransaction,
  readBoundSession,
  revokeTotp,
  revokeUserSessions,
  rotateRefreshToken,
  seedIdentityLinks,
  verifyTotp,
} from "../src/identity.ts";
import { TOTP, Secret } from "otpauth";
import { assertIdentityClaims, dexPasswordLogin, exchangeAuthorizationCode, readIssuerDocument, refreshOidc, resetOidcConfiguration, verifyPresentedIdToken } from "../src/oidc.ts";
import { seed } from "../src/seed.ts";
import { readSession } from "../src/session.ts";
import { listTenancy, seedDemoTenants } from "../src/tenancy.ts";
import { finishPasskeyRegistration } from "../src/webauthn.ts";

const exec = promisify(execFile);
const stackDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../infra/local");

function workspace() {
  const db = createDatabase(":memory:");
  seed(db);
  seedDemoTenants(db);
  seedIdentityLinks(db);
  return db;
}

test("P02-S10 a workforce password login at Dex opens only the linked account", async () => {
  resetOidcConfiguration();
  const db = workspace();
  const started = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  const tokens = await exchangeAuthorizationCode(started.callback, started);
  assert.equal(tokens.subject, dexLocalSubject("usr_amira"));
  const decision = decideExternalLogin(db, LOCAL_ISSUER, tokens.subject);
  assert.equal(decision.status, "session");
  if (decision.status !== "session") return;
  const sessionId = openLocalIdentitySession(db, {
    userId: decision.userId,
    issuer: LOCAL_ISSUER,
    subject: tokens.subject,
    assurance: decision.assurance,
    refreshToken: tokens.refreshToken,
  });
  assert.equal(readSession(db, sessionId)?.userId, "usr_amira");
  assert.equal(readSession(db, sessionId)?.organizationId, "org_harborlight");
  assert.equal(authCount(db, "login_success") > 0, true);
});

test("P02-S11 an incorrect Dex password does not return a code", async () => {
  await assert.rejects(() => dexPasswordLogin("amira.solano@harborlight.invalid", "wrong-password"), /refused the password/);
});

test("P02-S16 a tampered callback state is rejected", async () => {
  const started = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  started.callback.searchParams.set("state", "tampered-state");
  await assert.rejects(() => exchangeAuthorizationCode(started.callback, started), Error);
});

test("P02-S17 and P02-S18 a replayed code and a bad verifier are rejected", async () => {
  const started = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  await exchangeAuthorizationCode(started.callback, started);
  await assert.rejects(() => exchangeAuthorizationCode(started.callback, started), Error);
  const again = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  await assert.rejects(
    () => exchangeAuthorizationCode(again.callback, { ...again, codeVerifier: "not-the-verifier-value-0123456789" }),
    Error,
  );
});

test("P02-S19 and P02-S20 a new login rotates the session and a revoked session stays closed", () => {
  const db = workspace();
  const first = openLocalIdentitySession(db, { userId: "usr_amira", issuer: LOCAL_ISSUER, subject: "usr_amira", assurance: "password", refreshToken: null });
  const second = openLocalIdentitySession(db, { userId: "usr_amira", issuer: LOCAL_ISSUER, subject: "usr_amira", assurance: "password", refreshToken: null });
  assert.notEqual(first, second);
  revokeUserSessions(db, "usr_amira");
  assert.equal(readBoundSession(db, second)?.active, false);
  assert.equal(readSession(db, second), null);
});

test("P02-S24 and P02-S25 login does not grant another organization, and the nurse keeps two facilities", () => {
  const db = workspace();
  const decision = decideExternalLogin(db, LOCAL_ISSUER, dexLocalSubject("usr_gh_nurse"));
  assert.equal(decision.status, "session");
  const sameEmail = decideExternalLogin(db, LOCAL_ISSUER, "sub_same_email");
  assert.equal(sameEmail.status, "session");
  if (sameEmail.status !== "session") return;
  assert.equal(sameEmail.userId, "usr_gh_admin");
  assert.throws(() => decideExternalLogin(db, "https://evil.example", "usr_amira"), ForbiddenError);
  assert.deepEqual(decideExternalLogin(db, LOCAL_ISSUER, "sub_unknown"), { status: "pending" });
  const facilities = db.prepare("SELECT facility_id FROM facility_memberships WHERE user_id = ? AND status = 'active'").all("usr_gh_nurse") as Array<{ facility_id: string }>;
  assert.deepEqual(facilities.map((item) => item.facility_id).sort(), ["fac_gh_accra", "fac_gh_east_legon"]);
  db.prepare("UPDATE facility_memberships SET status = 'revoked' WHERE user_id = ? AND facility_id = 'fac_gh_accra'").run("usr_gh_nurse");
  const nurseSession = openLocalIdentitySession(db, { userId: "usr_gh_nurse", issuer: LOCAL_ISSUER, subject: dexLocalSubject("usr_gh_nurse"), assurance: "password", refreshToken: null });
  const view = listTenancy(db, nurseSession, new Headers());
  assert.equal(view.facilities.some((item) => item.id === "fac_gh_accra"), false);
  assert.equal(view.facilities.some((item) => item.id === "fac_gh_east_legon"), true);
  db.prepare("UPDATE organizations SET status = 'disabled' WHERE id = 'org_harborlight'").run();
  assert.throws(() => decideExternalLogin(db, LOCAL_ISSUER, dexLocalSubject("usr_amira")), ForbiddenError);
});

test("P02-S26 and P02-S27 TOTP enrollment, a good code, a bad code, and lockout", () => {
  const db = workspace();
  const enrolled = enrollTotp(db, "usr_amira");
  const totp = new TOTP({ issuer: "CuraSphere", label: "workforce", algorithm: "SHA1", digits: 6, period: 30, secret: Secret.fromBase32(enrolled.secret) });
  confirmTotp(db, "usr_amira", totp.generate());
  const pending = decideExternalLogin(db, LOCAL_ISSUER, dexLocalSubject("usr_amira"));
  assert.equal(pending.status, "mfa");
  if (pending.status !== "mfa") return;
  assert.throws(() => verifyTotp(db, pending.pendingId, "000000"), ValidationError);
  const pendingAgain = decideExternalLogin(db, LOCAL_ISSUER, dexLocalSubject("usr_amira"));
  if (pendingAgain.status !== "mfa") throw new Error("expected mfa");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      verifyTotp(db, pendingAgain.pendingId, "000000");
    } catch {
      // expected until the lock
    }
  }
  assert.throws(() => verifyTotp(db, pendingAgain.pendingId, totp.generate()), ForbiddenError);
  assert.equal(authCount(db, "mfa_failure") >= 5, true);
  revokeTotp(db, "usr_amira");
  assert.equal(decideExternalLogin(db, LOCAL_ISSUER, dexLocalSubject("usr_amira")).status, "session");
});

test("P02-S29 and P02-S30 refresh rotation rejects the previous token", async () => {
  resetOidcConfiguration();
  const db = workspace();
  const started = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  const tokens = await exchangeAuthorizationCode(started.callback, started);
  assert.ok(tokens.refreshToken);
  const sessionId = openLocalIdentitySession(db, {
    userId: "usr_amira",
    issuer: LOCAL_ISSUER,
    subject: "usr_amira",
    assurance: "password",
    refreshToken: tokens.refreshToken,
  });
  const first = await refreshOidc(tokens.refreshToken!);
  assert.notEqual(first.refreshToken, tokens.refreshToken);
  await assert.rejects(() => refreshOidc(tokens.refreshToken!));
  rotateRefreshToken(db, sessionId, tokens.refreshToken!, first.refreshToken);
  assert.throws(() => rotateRefreshToken(db, sessionId, tokens.refreshToken!, null), ForbiddenError);
  const concurrent = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  const concurrentTokens = await exchangeAuthorizationCode(concurrent.callback, concurrent);
  const raced = await Promise.allSettled([
    refreshOidc(concurrentTokens.refreshToken!),
    refreshOidc(concurrentTokens.refreshToken!),
  ]);
  assert.equal(raced.filter((item) => item.status === "fulfilled").length, 1);
  assert.equal(raced.filter((item) => item.status === "rejected").length, 1);
});

test("P02-S32 deactivating membership closes the bound session", () => {
  const db = workspace();
  const sessionId = openLocalIdentitySession(db, { userId: "usr_amira", issuer: LOCAL_ISSUER, subject: "usr_amira", assurance: "password", refreshToken: null });
  db.prepare("UPDATE organization_memberships SET status = 'revoked' WHERE user_id = ?").run("usr_amira");
  assert.equal(readBoundSession(db, sessionId)?.active, false);
});

test("P02-S34 an unexpected return address and a consumed transaction are rejected", () => {
  const db = workspace();
  assert.throws(() => beginAuthTransaction(db, { state: "state-1", nonce: "nonce-1", codeVerifier: "verifier-1", redirectUri: "https://evil.example/callback" }), ValidationError);
  const id = beginAuthTransaction(db, { state: "state-2", nonce: "nonce-2", codeVerifier: "verifier-2", redirectUri: "http://localhost:3000/api/auth/callback" });
  const row = readAuthTransaction(db, id);
  assert.equal(row.state, "state-2");
  consumeAuthTransaction(db, id);
  assert.throws(() => consumeAuthTransaction(db, id), ConflictError);
});

test("P02-S35 authentication events do not store the refresh token", async () => {
  const db = workspace();
  const started = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  const tokens = await exchangeAuthorizationCode(started.callback, started);
  openLocalIdentitySession(db, { userId: "usr_amira", issuer: LOCAL_ISSUER, subject: "usr_amira", assurance: "password", refreshToken: tokens.refreshToken });
  const events = db.prepare("SELECT action, outcome, subject_hash FROM auth_events").all() as Array<{ action: string; outcome: string; subject_hash: string | null }>;
  const dump = JSON.stringify(events);
  assert.equal(dump.includes("password"), false);
  if (tokens.refreshToken) assert.equal(dump.includes(tokens.refreshToken), false);
  if (tokens.accessToken) assert.equal(dump.includes(tokens.accessToken), false);
});

test("P02-S12 through P02-S15 a live token is verified and bad claims or signatures are rejected", async () => {
  const started = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  const tokens = await exchangeAuthorizationCode(started.callback, started);
  const payload = await verifyPresentedIdToken(tokens.idToken);
  assert.equal(payload.iss, LOCAL_ISSUER);
  assert.throws(() => assertIdentityClaims({ ...payload, iss: "https://evil.example" }), /issuer/);
  assert.throws(() => assertIdentityClaims({ ...payload, aud: "other-client" }), /audience/);
  assert.throws(() => assertIdentityClaims(payload, Number(payload.exp) + 5), /expired/);
  const [header, body, signature] = tokens.idToken.split(".");
  await assert.rejects(() => verifyPresentedIdToken(`${header}.${body}.${signature.slice(0, -2)}aa`), /signature/);
  await assert.rejects(() => verifyPresentedIdToken(`${header}.${body}`), /not signed/);
  const none = Buffer.from(JSON.stringify({ alg: "none", kid: payload.kid })).toString("base64url");
  await assert.rejects(() => verifyPresentedIdToken(`${none}.${body}.`), /algorithm|not signed/);
  const redirected = Buffer.from(JSON.stringify({ alg: "RS256", kid: "x", jku: "https://evil.example/jwks" })).toString("base64url");
  await assert.rejects(() => verifyPresentedIdToken(`${redirected}.${body}.${signature}`), /key source/);
  let fetched = false;
  await assert.rejects(
    () =>
      readIssuerDocument("https://evil.example", async () => {
        fetched = true;
        throw new Error("should not fetch");
      }),
    /not accepted/,
  );
  assert.equal(fetched, false);
});

test("P02-S21 an idle or absolute expiry closes the bound session", () => {
  const db = workspace();
  const idle = openLocalIdentitySession(db, { userId: "usr_amira", issuer: LOCAL_ISSUER, subject: "usr_amira", assurance: "password", refreshToken: null });
  db.prepare("UPDATE auth_sessions SET idle_expires_at = ? WHERE session_id = ?").run("2000-01-01T00:00:00.000Z", idle);
  assert.equal(readBoundSession(db, idle)?.active, false);
  const absolute = openLocalIdentitySession(db, { userId: "usr_amira", issuer: LOCAL_ISSUER, subject: "usr_amira", assurance: "password", refreshToken: null });
  db.prepare("UPDATE auth_sessions SET absolute_expires_at = ? WHERE session_id = ?").run("2000-01-01T00:00:00.000Z", absolute);
  assert.equal(readBoundSession(db, absolute)?.active, false);
});

test("P02-S22 discovery fails closed when the issuer is refused", async () => {
  await assert.rejects(
    () => readIssuerDocument(LOCAL_ISSUER, async () => { throw new Error("ECONNREFUSED"); }),
    /not available/,
  );
});

test("P02-S23 an authorization transaction survives a reopened database", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "cura-auth-"));
  const file = path.join(dir, "auth.sqlite");
  try {
    const db = createDatabase(file);
    seed(db);
    seedDemoTenants(db);
    seedIdentityLinks(db);
    const id = beginAuthTransaction(db, { state: "state-restart", nonce: "nonce-restart", codeVerifier: "verifier-restart-0123456789", redirectUri: "http://localhost:3000/api/auth/callback" });
    db.close();
    const reopened = createDatabase(file);
    assert.equal(readAuthTransaction(reopened, id).state, "state-restart");
    reopened.close();
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("P02-S28 a passkey response without a stored challenge is rejected", async () => {
  const db = workspace();
  await assert.rejects(() => finishPasskeyRegistration(db, "usr_amira", "missing-challenge", {
    id: "credential",
    rawId: "credential",
    type: "public-key",
    authenticatorAttachment: "platform",
    clientExtensionResults: {},
    response: { clientDataJSON: "", attestationObject: "", transports: ["internal"] },
  }));
});

test("P02-S31 and P02-S36 a Dex restart rotates keys and then accepts a new login", async () => {
  const started = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  const tokens = await exchangeAuthorizationCode(started.callback, started);
  await verifyPresentedIdToken(tokens.idToken);
  const inFlight = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  await exec("docker", ["compose", "stop", "dex"], { cwd: stackDir });
  await assert.rejects(() => readIssuerDocument(LOCAL_ISSUER), /not available/);
  await assert.rejects(() => exchangeAuthorizationCode(inFlight.callback, inFlight));
  await exec("docker", ["compose", "start", "dex"], { cwd: stackDir });
  let ready = false;
  for (let attempt = 0; attempt < 30 && !ready; attempt += 1) {
    try {
      await readIssuerDocument(LOCAL_ISSUER);
      ready = true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }
  assert.equal(ready, true);
  resetOidcConfiguration();
  await assert.rejects(() => verifyPresentedIdToken(tokens.idToken));
  const recovered = await dexPasswordLogin("amira.solano@harborlight.invalid", "password");
  const next = await exchangeAuthorizationCode(recovered.callback, recovered);
  assert.equal((await verifyPresentedIdToken(next.idToken)).sub, next.subject);
});
