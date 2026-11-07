import { getDb, listEmergencyReviews } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { denied, emergencyCaller } from "@/lib/emergency-http";

export async function GET() {
  const caller = await emergencyCaller();
  if (!caller) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    return NextResponse.json({ reviews: listEmergencyReviews(getDb(), caller.actor) });
  } catch {
    return denied();
  }
}
