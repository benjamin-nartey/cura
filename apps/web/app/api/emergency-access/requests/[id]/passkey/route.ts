import { activateEmergency, beginPasskeyAuthentication, getDb, verifyEmergencyPasskey } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { denied, emergencyCaller, sameOrigin } from "@/lib/emergency-http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return denied();
  const caller = await emergencyCaller();
  if (!caller) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  const contentType = request.headers.get("content-type") ?? "";
  try {
    if (!contentType.includes("application/json")) {
      const begun = await beginPasskeyAuthentication(getDb(), caller.actor.userId);
      return NextResponse.json(begun);
    }
    const body = (await request.json()) as { challengeId?: string; response?: Parameters<typeof verifyEmergencyPasskey>[4] };
    if (!body.challengeId || !body.response) return denied();
    await verifyEmergencyPasskey(getDb(), caller.actor, id, body.challengeId, body.response);
    const grant = activateEmergency(getDb(), caller.actor, id);
    return NextResponse.json({ grant });
  } catch {
    return NextResponse.json({ error: "Verification was not accepted." }, { status: 403 });
  }
}
