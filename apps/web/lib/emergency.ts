import type { SessionContext } from "@curasphere/contracts";
import {
  emergencyEligibility,
  getDb,
  seedDemoTenants,
  SYNTHETIC_RESOURCE_ID,
  type EmergencyActor,
} from "@curasphere/domain";
import { redirect } from "next/navigation";
import { optionalSession } from "@/lib/session";

export function emergencyActor(ctx: SessionContext): EmergencyActor {
  return {
    userId: ctx.userId,
    sessionId: ctx.sessionId,
    organizationId: ctx.organizationId,
    facilityId: ctx.facilityId,
  };
}

export async function emergencyContext() {
  const ctx = await optionalSession();
  if (!ctx) redirect("/");
  seedDemoTenants(getDb());
  return ctx;
}

export function syntheticEligibility(ctx: SessionContext) {
  return emergencyEligibility(getDb(), emergencyActor(ctx), SYNTHETIC_RESOURCE_ID);
}
