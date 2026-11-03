import { currentEmergencyGrant, getDb } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { emergencyCaller } from "@/lib/emergency-http";

export async function GET() {
  const caller = await emergencyCaller();
  if (!caller) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const grant = currentEmergencyGrant(getDb(), caller.actor);
  if (!grant) return NextResponse.json({ error: "No emergency access is active." }, { status: 404 });
  return NextResponse.json({ id: grant.id, resourceId: grant.resource_id, action: grant.action, expiresAt: grant.expires_at, requestId: grant.request_id });
}
