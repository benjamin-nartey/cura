import {
  getDb,
  listInvitations,
  listWorkforce,
  readWorkforceMember,
  seedDemoTenants,
  workforceActor,
  workforceFacilities,
  workforceHistory,
} from "@curasphere/domain";
import type { SessionContext } from "@curasphere/contracts";
import { redirect } from "next/navigation";
import { requireSession } from "@/lib/session";

export async function loadWorkforce() {
  const ctx = await requireSession();
  seedDemoTenants(getDb());
  const actor = workforceActor(ctx, "mfa");
  try {
    const directory = listWorkforce(getDb(), actor, {});
    return { ctx, actor, directory };
  } catch {
    redirect("/access/denied");
  }
}

export function workforceDb(ctx: SessionContext) {
  return { db: getDb(), actor: workforceActor(ctx, "directory") };
}

export function memberOrDeny(ctx: SessionContext, userId: string) {
  try {
    return readWorkforceMember(getDb(), workforceActor(ctx, "directory"), userId);
  } catch {
    redirect("/access/denied");
  }
}

export function invitationsFor(ctx: SessionContext) {
  return listInvitations(getDb(), workforceActor(ctx, "directory"));
}

export function historyFor(ctx: SessionContext, userId?: string) {
  return workforceHistory(getDb(), workforceActor(ctx, "directory"), userId);
}

export function facilitiesFor(ctx: SessionContext) {
  return workforceFacilities(getDb(), workforceActor(ctx, "directory"));
}
