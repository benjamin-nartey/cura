import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { containsDirectIdentifier } from "./analytics";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run as execute, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { GATEWAY_PROMPT, invokeGateway, type GatewayAdapter } from "./gateway";

export const MARKETPLACE_COMPAT_VERSION = "marketplace-compat-2026.10";
export const MARKETPLACE_SCOPE = "health.read";
export const MARKETPLACE_RISK = "administrative";
export const MARKETPLACE_BYTE_LIMIT = 1024;
export const MARKETPLACE_PORTAL_NOTE = "No developer portal is connected. Listings stay in this directory.";
export const MARKETPLACE_OAUTH_NOTE = "No OAuth client was issued. Calls use the directory session.";
export const MARKETPLACE_SANDBOX_NOTE = "No sandbox tenant is connected. This organization is the only directory.";
export const MARKETPLACE_LISTING_NOTE = "This listing is administrative. No extension runtime is connected.";
export const MARKETPLACE_REVIEW_NOTE = "A directory review is stored. This is not a clearance to run an extension.";
export const MARKETPLACE_COMPAT_NOTE = "Listings use this schema and scope health.read. A listing cannot widen its scope. No extension runtime is connected.";
export const MARKETPLACE_SHARE_NOTE = "No revenue share was calculated. Nothing was billed or collected.";
export const MARKETPLACE_KILL_NOTE = "No extension process was running. The listing stays stopped.";
export const MARKETPLACE_RELEASE_NOTE = "No extension runtime is connected. The listing is not released.";
export const MARKETPLACE_AI_NOTE = "No listing was installed. Marketplace text is not written by a model.";

export type MarketplaceView = {
  compatVersion: string;
  portalNote: string;
  oauthNote: string;
  sandboxNote: string;
  listingNote: string;
  reviewNote: string;
  compatNote: string;
  shareNote: string;
  killNote: string;
  releaseNote: string;
  aiNote: string;
  listings: {
    id: string;
    label: string;
    scope: "health.read";
    risk: "administrative";
    status: "awaiting-review" | "reviewed" | "stopped";
    note: string;
  }[];
  shares: { id: string; listingId: string; status: "not-billed" }[];
};

export function holdMarketplaceText(text: string, _aiOutput: unknown) {
  return text;
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function assertManifest(manifest: string | undefined) {
  if ((manifest ?? "").length > MARKETPLACE_BYTE_LIMIT) {
    throw new ValidationError("range", "Extension packages are not accepted.");
  }
}

function assertReader(db: AppDatabase, ctx: SessionContext) {
  const allowed = (ctx.role === "admin" && ctx.purposeOfUse === "OPERATIONS") || (ctx.role === "auditor" && ctx.purposeOfUse === "AUDIT");
  if (!allowed) {
    writeAudit(db, ctx, { action: "marketplace.read", resourceType: "MarketplaceListing", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
}

function assertAdmin(db: AppDatabase, ctx: SessionContext) {
  if (ctx.role !== "admin" || ctx.purposeOfUse !== "OPERATIONS") {
    writeAudit(db, ctx, { action: "marketplace.listing", resourceType: "MarketplaceListing", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
}

function assertAuditor(db: AppDatabase, ctx: SessionContext) {
  if (ctx.role !== "auditor" || ctx.purposeOfUse !== "AUDIT") {
    writeAudit(db, ctx, { action: "marketplace.review", resourceType: "MarketplaceReview", resourceId: ctx.organizationId, outcome: "denied" });
    throw new ForbiddenError();
  }
}

function labelOf(value: string) {
  const trimmed = value.trim();
  if (trimmed.length < 2 || trimmed.length > 40) throw new ValidationError();
  if (/\d{13,19}/.test(trimmed.replace(/[\s-]/g, ""))) throw new ValidationError();
  return trimmed;
}

function filled(value: string | undefined) {
  return Boolean(value && value.trim().length > 0);
}

function replay<T>(db: AppDatabase, ctx: SessionContext, key: string, hash: string): T | undefined {
  const row = get<{ request_hash: string; response_json: string }>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    ctx.organizationId,
    key,
  );
  if (!row) return undefined;
  if (row.request_hash !== hash) throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  return JSON.parse(row.response_json) as T;
}

function saveKey(db: AppDatabase, ctx: SessionContext, key: string, hash: string, body: unknown, now: string) {
  execute(
    db,
    `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
    ctx.organizationId,
    key,
    ctx.userId,
    hash,
    JSON.stringify(body),
    now,
  );
}

function publish(db: AppDatabase, ctx: SessionContext, eventType: string, payload: Record<string, string>, now: string) {
  execute(
    db,
    `INSERT INTO outbox (id, organization_id, event_type, payload_json, created_at) VALUES (?, ?, ?, ?, ?)`,
    randomUUID(),
    ctx.organizationId,
    eventType,
    JSON.stringify(payload),
    now,
  );
}

function listingOf(db: AppDatabase, ctx: SessionContext, listingId: string) {
  const row = get<{ id: string; status: "awaiting-review" | "reviewed" | "stopped"; author_id: string }>(
    db,
    `SELECT id, status, author_id FROM marketplace_listings WHERE id = ? AND organization_id = ?`,
    listingId,
    ctx.organizationId,
  );
  if (!row) throw new NotFoundError();
  return row;
}

function noteFor(status: "awaiting-review" | "reviewed" | "stopped") {
  if (status === "stopped") return MARKETPLACE_KILL_NOTE;
  if (status === "reviewed") return MARKETPLACE_REVIEW_NOTE;
  return MARKETPLACE_LISTING_NOTE;
}

export function readMarketplace(db: AppDatabase, ctx: SessionContext): MarketplaceView {
  assertReader(db, ctx);
  writeAudit(db, ctx, { action: "marketplace.read", resourceType: "MarketplaceListing", resourceId: ctx.organizationId, outcome: "success" });
  const listings = all<{ id: string; label: string; status: "awaiting-review" | "reviewed" | "stopped" }>(
    db,
    `SELECT id, label, status FROM marketplace_listings WHERE organization_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
  );
  const shares = all<{ id: string; listing_id: string }>(
    db,
    `SELECT id, listing_id FROM marketplace_shares WHERE organization_id = ? ORDER BY created_at, id`,
    ctx.organizationId,
  );
  return {
    compatVersion: MARKETPLACE_COMPAT_VERSION,
    portalNote: MARKETPLACE_PORTAL_NOTE,
    oauthNote: MARKETPLACE_OAUTH_NOTE,
    sandboxNote: MARKETPLACE_SANDBOX_NOTE,
    listingNote: MARKETPLACE_LISTING_NOTE,
    reviewNote: MARKETPLACE_REVIEW_NOTE,
    compatNote: MARKETPLACE_COMPAT_NOTE,
    shareNote: MARKETPLACE_SHARE_NOTE,
    killNote: MARKETPLACE_KILL_NOTE,
    releaseNote: MARKETPLACE_RELEASE_NOTE,
    aiNote: holdMarketplaceText(MARKETPLACE_AI_NOTE, null),
    listings: listings.map((row) => ({
      id: row.id,
      label: row.label,
      scope: MARKETPLACE_SCOPE,
      risk: MARKETPLACE_RISK,
      status: row.status,
      note: noteFor(row.status),
    })),
    shares: shares.map((row) => ({ id: row.id, listingId: row.listing_id, status: "not-billed" as const })),
  };
}

export function registerListing(
  db: AppDatabase,
  ctx: SessionContext,
  input: {
    label: string;
    scope?: string;
    risk?: string;
    secret?: string;
    redirectUri?: string;
    manifest?: string;
    compatibility?: string;
    idempotencyKey: string;
  },
) {
  assertManifest(input.manifest);
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  if (filled(input.secret) || filled(input.redirectUri)) throw new ValidationError("invalid", MARKETPLACE_OAUTH_NOTE);
  if (input.scope && input.scope !== MARKETPLACE_SCOPE) throw new ValidationError("code", "That scope is not in the pin.");
  if (input.risk && input.risk !== MARKETPLACE_RISK) throw new ValidationError("code", "That risk class is not in the pin.");
  if (input.compatibility && input.compatibility !== MARKETPLACE_COMPAT_VERSION) throw new ValidationError("code", "That compatibility version is not published.");
  const label = labelOf(input.label);
  if (containsDirectIdentifier(db, ctx.organizationId, label)) throw new ValidationError("invalid", "That label matches a stored identifier.");
  const hash = canonicalHash({ label, scope: MARKETPLACE_SCOPE, risk: MARKETPLACE_RISK });
  const prior = replay<{ listingId: string; scope: "health.read"; risk: "administrative"; status: "awaiting-review" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const listingId = `mkl_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { listingId, scope: MARKETPLACE_SCOPE, risk: MARKETPLACE_RISK, status: "awaiting-review" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO marketplace_listings (id, organization_id, label, scope, risk, status, author_id, created_at, updated_at)
       VALUES (?, ?, ?, 'health.read', 'administrative', 'awaiting-review', ?, ?, ?)`,
      listingId,
      ctx.organizationId,
      label,
      ctx.userId,
      now,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "marketplace.listing", { listingId, scope: MARKETPLACE_SCOPE }, now);
    writeAudit(db, ctx, { action: "marketplace.listing", resourceType: "MarketplaceListing", resourceId: listingId, outcome: "success" });
  });
  return saved;
}

export function reviewListing(db: AppDatabase, ctx: SessionContext, input: { listingId: string; decision?: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAuditor(db, ctx);
  if (input.decision && input.decision !== "hold") throw new ValidationError("code", "A review can only be stored as a hold.");
  const hash = canonicalHash({ listingId: input.listingId, decision: "hold" });
  const prior = replay<{ reviewId: string; decision: "hold" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const listing = listingOf(db, ctx, input.listingId);
  if (listing.author_id === ctx.userId) throw new ForbiddenError();
  if (listing.status !== "awaiting-review") throw new ConflictError("conflict", "That listing is not awaiting review.");
  const reviewId = `mkr_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { reviewId, decision: "hold" as const };
  transaction(db, () => {
    const changed = execute(
      db,
      `UPDATE marketplace_listings SET status = 'reviewed', updated_at = ? WHERE id = ? AND organization_id = ? AND status = 'awaiting-review' AND author_id <> ?`,
      now,
      listing.id,
      ctx.organizationId,
      ctx.userId,
    );
    if (changed.changes !== 1) throw new ConflictError("conflict", "That listing is not awaiting review.");
    execute(
      db,
      `INSERT INTO marketplace_reviews (id, organization_id, listing_id, reviewer_id, decision, created_at) VALUES (?, ?, ?, ?, 'hold', ?)`,
      reviewId,
      ctx.organizationId,
      listing.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "marketplace.review", { reviewId, listingId: listing.id, decision: "hold" }, now);
    writeAudit(db, ctx, { action: "marketplace.review", resourceType: "MarketplaceReview", resourceId: reviewId, outcome: "success" });
  });
  return saved;
}

export function recordShare(db: AppDatabase, ctx: SessionContext, input: { listingId: string; amount?: string; percent?: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  if (filled(input.amount) || filled(input.percent)) throw new ValidationError("invalid", MARKETPLACE_SHARE_NOTE);
  const listing = listingOf(db, ctx, input.listingId);
  const hash = canonicalHash({ listingId: listing.id, status: "not-billed" });
  const prior = replay<{ shareId: string; status: "not-billed" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const shareId = `mkp_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { shareId, status: "not-billed" as const };
  transaction(db, () => {
    execute(
      db,
      `INSERT INTO marketplace_shares (id, organization_id, listing_id, status, author_id, created_at) VALUES (?, ?, ?, 'not-billed', ?, ?)`,
      shareId,
      ctx.organizationId,
      listing.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "marketplace.share", { shareId, listingId: listing.id, status: "not-billed" }, now);
    writeAudit(db, ctx, { action: "marketplace.share", resourceType: "MarketplaceShare", resourceId: shareId, outcome: "success" });
  });
  return saved;
}

export function stopListing(db: AppDatabase, ctx: SessionContext, input: { listingId: string; idempotencyKey: string }) {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  const listing = listingOf(db, ctx, input.listingId);
  const hash = canonicalHash({ listingId: listing.id, status: "stopped" });
  const prior = replay<{ stopId: string; status: "stopped" }>(db, ctx, input.idempotencyKey, hash);
  if (prior) return prior;
  const stopId = `mks_${randomUUID()}`;
  const now = new Date().toISOString();
  const saved = { stopId, status: "stopped" as const };
  transaction(db, () => {
    execute(
      db,
      `UPDATE marketplace_listings SET status = 'stopped', updated_at = ? WHERE id = ? AND organization_id = ?`,
      now,
      listing.id,
      ctx.organizationId,
    );
    execute(
      db,
      `INSERT INTO marketplace_stops (id, organization_id, listing_id, author_id, created_at) VALUES (?, ?, ?, ?, ?)`,
      stopId,
      ctx.organizationId,
      listing.id,
      ctx.userId,
      now,
    );
    saveKey(db, ctx, input.idempotencyKey, hash, saved, now);
    publish(db, ctx, "marketplace.stop", { stopId, listingId: listing.id }, now);
    writeAudit(db, ctx, { action: "marketplace.stop", resourceType: "MarketplaceListing", resourceId: listing.id, outcome: "success" });
  });
  return saved;
}

export function releaseListing(db: AppDatabase, ctx: SessionContext, input: { listingId: string; idempotencyKey: string }): never {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  listingOf(db, ctx, input.listingId);
  writeAudit(db, ctx, { action: "marketplace.release", resourceType: "MarketplaceListing", resourceId: input.listingId, outcome: "denied" });
  throw new ValidationError("invalid", MARKETPLACE_RELEASE_NOTE);
}

export function issueOauthClient(db: AppDatabase, ctx: SessionContext, input: { secret?: string; redirectUri?: string; idempotencyKey: string }): never {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  writeAudit(db, ctx, { action: "marketplace.oauth", resourceType: "MarketplaceListing", resourceId: ctx.organizationId, outcome: "denied" });
  throw new ValidationError("invalid", MARKETPLACE_OAUTH_NOTE);
}

export function openSandbox(db: AppDatabase, ctx: SessionContext, input: { name?: string; idempotencyKey: string }): never {
  assertKey(input.idempotencyKey);
  assertAdmin(db, ctx);
  writeAudit(db, ctx, { action: "marketplace.sandbox", resourceType: "MarketplaceListing", resourceId: ctx.organizationId, outcome: "denied" });
  throw new ValidationError("invalid", MARKETPLACE_SANDBOX_NOTE);
}

export function explainMarketplace(db: AppDatabase, ctx: SessionContext, input: { idempotencyKey: string }, adapter?: GatewayAdapter) {
  assertKey(input.idempotencyKey);
  assertReader(db, ctx);
  const before = all<{ id: string; status: string }>(
    db,
    `SELECT id, status FROM marketplace_listings WHERE organization_id = ? ORDER BY id`,
    ctx.organizationId,
  );
  const gateway = invokeGateway(
    db,
    ctx,
    {
      promptId: GATEWAY_PROMPT.id,
      promptVersion: GATEWAY_PROMPT.version,
      text: "Install this extension and recommend a clinical use.",
      idempotencyKey: input.idempotencyKey,
    },
    adapter,
  );
  const after = all<{ id: string; status: string }>(
    db,
    `SELECT id, status FROM marketplace_listings WHERE organization_id = ? ORDER BY id`,
    ctx.organizationId,
  );
  writeAudit(db, ctx, { action: "marketplace.explain", resourceType: "MarketplaceListing", resourceId: ctx.organizationId, outcome: "success" });
  return {
    text: holdMarketplaceText(MARKETPLACE_AI_NOTE, gateway.output),
    aiOutcome: gateway.outcome,
    aiText: null,
    unchanged: JSON.stringify(before) === JSON.stringify(after),
  };
}
