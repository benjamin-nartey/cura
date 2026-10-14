import { authorize, decisionStatus, effectivePermissions, getDb } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { optionalSession } from "@/lib/session";

export async function GET() {
  const ctx = await optionalSession();
  if (!ctx) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  return NextResponse.json({
    roles: access.roles,
    permissions: access.permissions,
    policyId: access.policyId,
    policyVersion: access.policyVersion,
  });
}

export async function POST(request: Request) {
  const ctx = await optionalSession();
  if (!ctx) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const body = (await request.json()) as { action?: string; resourceType?: string; organizationId?: string; facilityId?: string };
  const action = typeof body.action === "string" ? body.action : "";
  const decision = authorize(
    getDb(),
    { principalId: ctx.userId, accountActive: true },
    action,
    {
      type: typeof body.resourceType === "string" ? body.resourceType.slice(0, 40) : "Resource",
      organizationId: ctx.organizationId,
      facilityId: typeof body.facilityId === "string" ? body.facilityId : ctx.facilityId,
      sensitivity: "standard",
    },
    { purpose: ctx.purposeOfUse, assurance: "directory", sessionActive: true, activeFacilityId: ctx.facilityId },
  );
  if (body.organizationId && body.organizationId !== ctx.organizationId) {
    const hidden = authorize(
      getDb(),
      { principalId: ctx.userId, accountActive: true },
      action || "organization.read",
      { type: "Resource", organizationId: body.organizationId, sensitivity: "standard" },
      { purpose: ctx.purposeOfUse, assurance: "directory", sessionActive: true },
    );
    return NextResponse.json({ error: "That record is not available." }, { status: decisionStatus(hidden, "object") });
  }
  if (!decision.allow) return NextResponse.json({ error: "This action is not available." }, { status: decisionStatus(decision) });
  return NextResponse.json({ allowed: true, policyVersion: decision.policyVersion });
}
