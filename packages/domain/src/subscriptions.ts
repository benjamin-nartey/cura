import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import { writeAudit } from "./audit";
import { canonicalHash } from "./briefing";
import { all, get, run, transaction, type AppDatabase } from "./db";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "./errors";
import { historyBundle, loadObservation, LOCAL_INBOX, type FhirResource } from "./fhir-map";
import { canReadChart } from "./session";

type IdemRow = { request_hash: string; response_json: string };

function assertFacility(ctx: SessionContext): asserts ctx is SessionContext & { facilityId: string } {
  if (!ctx.facilityId) throw new ForbiddenError();
}

function assertKey(key: string) {
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(key)) throw new ValidationError();
}

function readIdem<T>(db: AppDatabase, organizationId: string, key: string, hash: string): T | undefined {
  const row = get<IdemRow>(
    db,
    `SELECT request_hash, response_json FROM idempotency_keys WHERE organization_id = ? AND idempotency_key = ?`,
    organizationId,
    key,
  );
  if (!row) return undefined;
  if (row.request_hash !== hash) {
    throw new ConflictError("duplicate", "That submission key was already used for a different entry.");
  }
  return JSON.parse(row.response_json) as T;
}

export function queueObservationNotifications(db: AppDatabase, ctx: SessionContext, observationId: string) {
  if (!ctx.facilityId) return;
  const subs = all<{ id: string }>(
    db,
    `SELECT id FROM fhir_subscriptions
     WHERE organization_id = ? AND facility_id = ? AND status = 'active' AND criteria = 'Observation'`,
    ctx.organizationId,
    ctx.facilityId,
  );
  if (subs.length === 0) return;
  const resource = loadObservation(db, ctx.organizationId, ctx.facilityId, observationId);
  if (!resource) return;
  const payload = JSON.stringify(historyBundle(resource));
  const now = new Date().toISOString();
  for (const sub of subs) {
    run(
      db,
      `INSERT INTO fhir_notifications (id, subscription_id, organization_id, facility_id, resource_type, resource_id, payload_json, created_at)
       VALUES (?, ?, ?, ?, 'Observation', ?, ?, ?)`,
      randomUUID(),
      sub.id,
      ctx.organizationId,
      ctx.facilityId,
      observationId,
      payload,
      now,
    );
  }
}

export function createObservationSubscription(db: AppDatabase, ctx: SessionContext, idempotencyKey: string) {
  if (!canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "fhir.subscribe", resourceType: "Subscription", resourceId: null, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertFacility(ctx);
  assertKey(idempotencyKey);
  const hash = canonicalHash({ criteria: "Observation", endpoint: LOCAL_INBOX });
  return transaction(db, () => {
    const replay = readIdem<{ id: string }>(db, ctx.organizationId, idempotencyKey, hash);
    if (replay) return replay;
    const id = `sub_${randomUUID()}`;
    const now = new Date().toISOString();
    run(
      db,
      `INSERT INTO fhir_subscriptions (id, organization_id, facility_id, criteria, channel_type, endpoint, status, author_id, recorded_at)
       VALUES (?, ?, ?, 'Observation', 'rest-hook', ?, 'active', ?, ?)`,
      id,
      ctx.organizationId,
      ctx.facilityId,
      LOCAL_INBOX,
      ctx.userId,
      now,
    );
    writeAudit(db, ctx, { action: "fhir.subscribe", resourceType: "Subscription", resourceId: id, outcome: "success" });
    const created = { id };
    run(
      db,
      `INSERT INTO idempotency_keys (organization_id, idempotency_key, actor_id, request_hash, response_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
      ctx.organizationId,
      idempotencyKey,
      ctx.userId,
      hash,
      JSON.stringify(created),
      now,
    );
    return created;
  });
}

export function subscriptionResource(db: AppDatabase, ctx: SessionContext, id: string): FhirResource | undefined {
  assertFacility(ctx);
  const row = get<{ id: string; criteria: string; channel_type: string; endpoint: string; status: string }>(
    db,
    `SELECT id, criteria, channel_type, endpoint, status FROM fhir_subscriptions WHERE id = ? AND organization_id = ? AND facility_id = ?`,
    id,
    ctx.organizationId,
    ctx.facilityId,
  );
  if (!row) return undefined;
  return {
    resourceType: "Subscription",
    id: row.id,
    status: row.status,
    criteria: row.criteria,
    channel: { type: row.channel_type, endpoint: row.endpoint },
    reason: "Facility observation inbox",
  };
}

export function listObservationSubscriptions(db: AppDatabase, ctx: SessionContext) {
  if (!canReadChart(ctx)) throw new ForbiddenError();
  assertFacility(ctx);
  return all<{ id: string; criteria: string; endpoint: string; status: string; recorded_at: string; notifications: number }>(
    db,
    `SELECT s.id, s.criteria, s.endpoint, s.status, s.recorded_at,
            (SELECT COUNT(*) FROM fhir_notifications n WHERE n.subscription_id = s.id) AS notifications
     FROM fhir_subscriptions s
     WHERE s.organization_id = ? AND s.facility_id = ?
     ORDER BY s.recorded_at DESC`,
    ctx.organizationId,
    ctx.facilityId,
  ).map((row) => ({
    id: row.id,
    criteria: row.criteria,
    endpoint: row.endpoint,
    status: row.status,
    recordedAt: row.recorded_at,
    notifications: Number(row.notifications),
  }));
}

export function listSubscriptionNotifications(db: AppDatabase, ctx: SessionContext, subscriptionId: string): FhirResource[] {
  if (!canReadChart(ctx)) {
    writeAudit(db, ctx, { action: "fhir.notify.read", resourceType: "Subscription", resourceId: subscriptionId, outcome: "denied" });
    throw new ForbiddenError();
  }
  assertFacility(ctx);
  const owned = subscriptionResource(db, ctx, subscriptionId);
  if (!owned) {
    const elsewhere = get<{ id: string }>(db, `SELECT id FROM fhir_subscriptions WHERE id = ?`, subscriptionId);
    writeAudit(db, ctx, {
      action: "fhir.notify.read",
      resourceType: "Subscription",
      resourceId: subscriptionId,
      outcome: elsewhere ? "denied" : "not_found",
    });
    throw new NotFoundError();
  }
  const rows = all<{ payload_json: string }>(
    db,
    `SELECT payload_json FROM fhir_notifications
     WHERE subscription_id = ? AND organization_id = ? AND facility_id = ?
     ORDER BY created_at`,
    subscriptionId,
    ctx.organizationId,
    ctx.facilityId,
  );
  writeAudit(db, ctx, { action: "fhir.notify.read", resourceType: "Subscription", resourceId: subscriptionId, outcome: "success" });
  return rows.map((row) => JSON.parse(row.payload_json) as FhirResource);
}
