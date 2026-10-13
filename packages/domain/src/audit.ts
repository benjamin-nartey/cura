import { randomUUID } from "node:crypto";
import type { SessionContext } from "@curasphere/contracts";
import type { AppDatabase } from "./db";
import { run } from "./db";

export function writeAudit(
  db: AppDatabase,
  ctx: SessionContext,
  event: { action: string; resourceType: string; resourceId: string | null; outcome: "success" | "denied" | "not_found" | "conflict" },
) {
  run(
    db,
    `INSERT INTO audit_events (id, organization_id, actor_id, purpose_of_use, action, resource_type, resource_id, outcome, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    randomUUID(),
    ctx.organizationId,
    ctx.userId,
    ctx.purposeOfUse,
    event.action,
    event.resourceType,
    event.resourceId,
    event.outcome,
    new Date().toISOString(),
  );
}

export function noteDenial(db: AppDatabase, ctx: SessionContext, action: string, resourceType: string, resourceId: string | null) {
  writeAudit(db, ctx, { action, resourceType, resourceId, outcome: "denied" });
}
