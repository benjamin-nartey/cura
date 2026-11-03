import { getDb, listWorkforce, workforceActor } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { optionalSession } from "@/lib/session";

export async function GET(request: Request) {
  const ctx = await optionalSession();
  if (!ctx) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const url = new URL(request.url);
  try {
    const view = listWorkforce(getDb(), workforceActor(ctx), {
      q: url.searchParams.get("q") ?? "",
      facilityId: url.searchParams.get("facilityId") ?? "",
      role: url.searchParams.get("role") ?? "",
      status: url.searchParams.get("status") ?? "",
    });
    return NextResponse.json(view);
  } catch {
    return NextResponse.json({ error: "This action is not available." }, { status: 403 });
  }
}
