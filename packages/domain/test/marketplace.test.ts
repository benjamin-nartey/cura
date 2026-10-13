import assert from "node:assert/strict";
import test from "node:test";
import {
  FIXTURES,
  ForbiddenError,
  MARKETPLACE_COMPAT_NOTE,
  MARKETPLACE_KILL_NOTE,
  MARKETPLACE_OAUTH_NOTE,
  MARKETPLACE_RELEASE_NOTE,
  MARKETPLACE_REVIEW_NOTE,
  MARKETPLACE_SANDBOX_NOTE,
  MARKETPLACE_SHARE_NOTE,
  NotFoundError,
  ValidationError,
  ConflictError,
  createDatabase,
  explainMarketplace,
  holdMarketplaceText,
  issueOauthClient,
  listDirectory,
  openSandbox,
  openSession,
  readMarketplace,
  readRevenue,
  readSession,
  recordShare,
  registerListing,
  releaseListing,
  reviewListing,
  seed,
  stopListing,
} from "../src/index.ts";

function signIn(userId: string) {
  const db = createDatabase(":memory:");
  seed(db);
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return { db, ctx };
}

function session(db: ReturnType<typeof createDatabase>, userId: string) {
  const opened = openSession(db, userId);
  const ctx = readSession(db, opened.sessionId);
  if (!ctx) throw new Error("session missing");
  return ctx;
}

test("a listing stays in the directory, and an extension is not installed", () => {
  const { db, ctx } = signIn(FIXTURES.admin);
  const priya = session(db, FIXTURES.priya);
  assert.throws(() => readMarketplace(db, session(db, FIXTURES.amira)), (error: unknown) => error instanceof ForbiddenError);
  assert.throws(() => readMarketplace(db, session(db, FIXTURES.evan)), (error: unknown) => error instanceof ForbiddenError);
  const started = Date.now();
  assert.throws(
    () => registerListing(db, ctx, { label: "Local catalog", manifest: "x".repeat(1025), idempotencyKey: "mkt-big-0001" }),
    (error: unknown) => error instanceof ValidationError && error.code === "range",
  );
  assert.ok(Date.now() - started < 1000);
  assert.equal(readMarketplace(db, ctx).listings.length, 0);
  assert.throws(
    () => registerListing(db, ctx, { label: "Local catalog", scope: "chart.write", idempotencyKey: "mkt-scope-01" }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
  assert.throws(
    () => registerListing(db, ctx, { label: "Local catalog", risk: "clinical", idempotencyKey: "mkt-risk-001" }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
  assert.throws(
    () => registerListing(db, ctx, { label: "Local catalog", secret: "super-secret-value", idempotencyKey: "mkt-secret01" }),
    (error: unknown) => error instanceof ValidationError && error.message === MARKETPLACE_OAUTH_NOTE,
  );
  assert.throws(
    () => registerListing(db, ctx, { label: "Elena catalog", idempotencyKey: "mkt-name-001" }),
    (error: unknown) => error instanceof ValidationError,
  );
  assert.equal(readMarketplace(db, ctx).listings.length, 0);
  const listed = registerListing(db, ctx, { label: "Local catalog", idempotencyKey: "mkt-list-001" });
  assert.equal(listed.scope, "health.read");
  assert.equal(listed.risk, "administrative");
  assert.equal(listed.status, "awaiting-review");
  assert.equal(registerListing(db, ctx, { label: "Local catalog", idempotencyKey: "mkt-list-001" }).listingId, listed.listingId);
  assert.throws(
    () => registerListing(db, ctx, { label: "Other catalog", idempotencyKey: "mkt-list-001" }),
    (error: unknown) => error instanceof ConflictError,
  );
  assert.throws(
    () => reviewListing(db, ctx, { listingId: listed.listingId, idempotencyKey: "mkt-rev-0001" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  assert.throws(
    () => reviewListing(db, priya, { listingId: listed.listingId, decision: "approved", idempotencyKey: "mkt-rev-0002" }),
    (error: unknown) => error instanceof ValidationError && error.code === "code",
  );
  const review = reviewListing(db, priya, { listingId: listed.listingId, idempotencyKey: "mkt-rev-0003" });
  assert.equal(review.decision, "hold");
  assert.throws(
    () => reviewListing(db, session(db, FIXTURES.nabil), { listingId: listed.listingId, idempotencyKey: "mkt-rev-0004" }),
    (error: unknown) => error instanceof ConflictError,
  );
  const beforeLedger = readRevenue(db, ctx).reconciliation;
  assert.throws(
    () => recordShare(db, ctx, { listingId: listed.listingId, amount: "2500", idempotencyKey: "mkt-share-01" }),
    (error: unknown) => error instanceof ValidationError && error.message === MARKETPLACE_SHARE_NOTE,
  );
  assert.equal(recordShare(db, ctx, { listingId: listed.listingId, idempotencyKey: "mkt-share-02" }).status, "not-billed");
  assert.deepEqual(readRevenue(db, ctx).reconciliation, beforeLedger);
  const beforeRelease = readMarketplace(db, ctx).listings[0]?.status;
  assert.throws(
    () => releaseListing(db, ctx, { listingId: listed.listingId, idempotencyKey: "mkt-rel-0001" }),
    (error: unknown) => error instanceof ValidationError && error.message === MARKETPLACE_RELEASE_NOTE,
  );
  assert.equal(readMarketplace(db, ctx).listings[0]?.status, beforeRelease);
  const directory = listDirectory(db).length;
  assert.throws(
    () => openSandbox(db, ctx, { name: "Sandbox Health", idempotencyKey: "mkt-sand-001" }),
    (error: unknown) => error instanceof ValidationError && error.message === MARKETPLACE_SANDBOX_NOTE,
  );
  assert.throws(
    () => issueOauthClient(db, ctx, { secret: "client-secret", redirectUri: "https://apps.example/callback", idempotencyKey: "mkt-oauth-01" }),
    (error: unknown) => error instanceof ValidationError && error.message === MARKETPLACE_OAUTH_NOTE,
  );
  assert.equal(listDirectory(db).length, directory);
  assert.throws(
    () => stopListing(db, priya, { listingId: listed.listingId, idempotencyKey: "mkt-stop-001" }),
    (error: unknown) => error instanceof ForbiddenError,
  );
  assert.equal(stopListing(db, ctx, { listingId: listed.listingId, idempotencyKey: "mkt-stop-002" }).status, "stopped");
  assert.throws(
    () => recordShare(db, ctx, { listingId: "mkl_missing", idempotencyKey: "mkt-share-03" }),
    (error: unknown) => error instanceof NotFoundError,
  );
  const explained = explainMarketplace(
    db,
    ctx,
    { idempotencyKey: "mkt-exp-0001" },
    { provider: "local", modelId: "mdl_none", modelVersion: "0", invoke: () => ({ install: true }) },
  );
  assert.equal(explained.aiOutcome, "refused");
  assert.equal(explained.unchanged, true);
  assert.equal(explained.text, holdMarketplaceText("No listing was installed. Marketplace text is not written by a model.", { install: true }));
  const view = readMarketplace(db, ctx);
  assert.equal(view.compatNote, MARKETPLACE_COMPAT_NOTE);
  assert.equal(view.listings[0]?.status, "stopped");
  assert.equal(view.listings[0]?.note, MARKETPLACE_KILL_NOTE);
  assert.equal(view.listings[0]?.scope, "health.read");
  assert.equal(view.reviewNote, MARKETPLACE_REVIEW_NOTE);
  assert.equal(view.shares[0]?.status, "not-billed");
  assert.equal(JSON.stringify(view).includes("Elena"), false);
  assert.equal(JSON.stringify(view).includes("secret"), false);
});
