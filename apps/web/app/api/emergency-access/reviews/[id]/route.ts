import { getDb, readEmergencyReview } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { denied, emergencyCaller } from "@/lib/emergency-http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const caller = await emergencyCaller();
  if (!caller) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  try {
    const detail = readEmergencyReview(getDb(), caller.actor, id);
    return NextResponse.json({
      review: detail.review,
      request: detail.request ? { reasonCategory: detail.request.reason_category, justification: detail.request.justification, resourceId: detail.request.resource_id } : null,
      events: detail.events,
    });
  } catch {
    return denied();
  }
}
