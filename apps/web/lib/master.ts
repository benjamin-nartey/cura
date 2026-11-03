import type { SessionContext } from "@curasphere/contracts";

export function masterActor(ctx: SessionContext) {
  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    facilityId: ctx.facilityId,
    sessionId: ctx.sessionId,
  };
}
