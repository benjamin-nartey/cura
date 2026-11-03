import { ForbiddenError, getDb, listAccessLedger } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { optionalSession } from "@/lib/session";

export async function GET() {
  const ctx = await optionalSession();
  if (!ctx) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const ledger = listAccessLedger(getDb(), {
      userId: ctx.userId,
      organizationId: ctx.organizationId,
      facilityId: ctx.facilityId,
    });
    return NextResponse.json({
      experimental: true,
      formalPhase03: "NOT_AUTHORIZED",
      intact: ledger.intact,
      brokenAt: ledger.brokenAt,
      entries: ledger.entries,
    });
  } catch (error) {
    if (error instanceof ForbiddenError) return NextResponse.json({ error: "The access ledger is limited to auditors." }, { status: 403 });
    throw error;
  }
}
