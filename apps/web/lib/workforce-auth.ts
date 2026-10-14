import {
  bindAuthSession,
  completePendingLogin,
  consumeAuthTransaction,
  decideExternalLogin,
  exchangeAuthorizationCode,
  getDb,
  LOCAL_ISSUER,
  readAuthTransaction,
  recordAuthEvent,
  REDIRECT_URI,
  seedDemoTenants,
  seedIdentityLinks,
  startOidc,
  verifyTotp,
} from "@curasphere/domain";
import { beginAuthTransaction } from "@curasphere/domain";
import { openFoundationSession } from "@/lib/foundation";

export async function prepareIdentityDatabase() {
  const db = getDb();
  seedDemoTenants(db);
  seedIdentityLinks(db);
  return db;
}

export async function beginWorkforceLogin() {
  // Redirect is pinned in the domain package. Do not accept a caller-supplied return address.
  const db = await prepareIdentityDatabase();
  const started = await startOidc();
  const id = beginAuthTransaction(db, {
    state: started.state,
    nonce: started.nonce,
    codeVerifier: started.codeVerifier,
    redirectUri: REDIRECT_URI,
  });
  return { id, url: started.url.href };
}

export async function finishWorkforceLogin(transactionId: string, callbackUrl: URL) {
  const db = await prepareIdentityDatabase();
  const transaction = readAuthTransaction(db, transactionId);
  if (callbackUrl.searchParams.get("state") !== transaction.state) {
    consumeAuthTransaction(db, transactionId);
    throw new Error("state");
  }
  const current = new URL(REDIRECT_URI);
  current.search = callbackUrl.search;
  const startedAt = Date.now();
  const tokens = await exchangeAuthorizationCode(current, {
    state: transaction.state,
    nonce: transaction.nonce,
    codeVerifier: transaction.code_verifier,
  });
  recordAuthEvent(db, "auth.latency", "success", tokens.subject, transactionId, Date.now() - startedAt);
  consumeAuthTransaction(db, transactionId);
  const decision = decideExternalLogin(db, LOCAL_ISSUER, tokens.subject, tokens.refreshToken);
  if (decision.status === "pending") return { status: "pending" as const };
  if (decision.status === "mfa") return { status: "mfa" as const, pendingId: decision.pendingId };
  const opened = await openFoundationSession(decision.userId);
  if (opened.status !== "ok") return { status: "idp" as const };
  bindAuthSession(db, {
    sessionId: opened.sessionId,
    userId: decision.userId,
    issuer: "http://127.0.0.1:15556/dex",
    subject: tokens.subject,
    assurance: decision.assurance,
    refreshToken: tokens.refreshToken,
  });
  return { status: "session" as const, sessionId: opened.sessionId };
}

export async function finishMfa(pendingId: string, code: string) {
  const db = await prepareIdentityDatabase();
  const pending = verifyTotp(db, pendingId, code);
  const opened = await openFoundationSession(pending.user_id);
  if (opened.status !== "ok") return { status: "idp" as const };
  bindAuthSession(db, {
    sessionId: opened.sessionId,
    userId: pending.user_id,
    issuer: pending.issuer,
    subject: pending.subject,
    assurance: "mfa",
    refreshToken: pending.refresh_token,
  });
  return { status: "session" as const, sessionId: opened.sessionId };
}

export async function finishPasskeyLogin(pendingId: string, userId: string) {
  const db = await prepareIdentityDatabase();
  const pending = completePendingLogin(db, pendingId);
  if (pending.user_id !== userId) return { status: "mfa" as const };
  const opened = await openFoundationSession(pending.user_id);
  if (opened.status !== "ok") return { status: "idp" as const };
  bindAuthSession(db, {
    sessionId: opened.sessionId,
    userId: pending.user_id,
    issuer: pending.issuer,
    subject: pending.subject,
    assurance: "mfa",
    refreshToken: pending.refresh_token,
  });
  return { status: "session" as const, sessionId: opened.sessionId };
}
