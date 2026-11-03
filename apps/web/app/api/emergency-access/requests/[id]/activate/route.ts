import { activateEmergency, getDb } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { failureCode, redirectTo } from "@/lib/http";
import { denied, emergencyCaller, sameOrigin } from "@/lib/emergency-http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return denied();
  const caller = await emergencyCaller();
  if (!caller) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  try {
    const grant = activateEmergency(getDb(), caller.actor, id);
    const wantsJson = request.headers.get("accept")?.includes("application/json");
    if (wantsJson) return NextResponse.json({ grant });
    return redirectTo(request, "/emergency/active");
  } catch (error) {
    return NextResponse.json({ error: failureCode(error) }, { status: 403 });
  }
}
