import { emergencyHistory, getDb } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { emergencyCaller } from "@/lib/emergency-http";

export async function GET() {
  const caller = await emergencyCaller();
  if (!caller) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const rows = emergencyHistory(getDb(), caller.actor) as Array<Record<string, unknown>>;
  return NextResponse.json({
    history: rows.map((row) => ({
      id: row.id,
      createdAt: row.created_at,
      reasonCategory: row.reason_category,
      resourceId: row.resource_id,
      status: row.status,
      expiresAt: row.expires_at,
      reviewStatus: row.review_status,
    })),
  });
}
