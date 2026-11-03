import { getDb, seedDemoTenants, SYNTHETIC_RESOURCE_ID, emergencyEligibility } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { denied, emergencyCaller } from "@/lib/emergency-http";

export async function GET() {
  const caller = await emergencyCaller();
  if (!caller) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  seedDemoTenants(getDb());
  const eligibility = emergencyEligibility(getDb(), caller.actor, SYNTHETIC_RESOURCE_ID);
  if (!eligibility.eligible) return NextResponse.json({ eligible: false });
  return NextResponse.json({ eligible: true, reason: eligibility.reason });
}
