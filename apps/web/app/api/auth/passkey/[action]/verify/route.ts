import { finishPasskeyAuthentication, finishPasskeyRegistration } from "@curasphere/domain";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { currentSession, withSession } from "@/lib/http";
import { finishPasskeyLogin, prepareIdentityDatabase } from "@/lib/workforce-auth";

export async function POST(request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  const body = (await request.json()) as { challengeId?: string; response?: never };
  if (!body.challengeId || !body.response) return Response.json({ error: "invalid" }, { status: 400 });
  const db = await prepareIdentityDatabase();
  try {
    if (action === "register") {
      const ctx = await currentSession();
      if (!ctx) return Response.json({ error: "signin" }, { status: 401 });
      await finishPasskeyRegistration(db, ctx.userId, body.challengeId, body.response);
      return Response.json({ ok: true });
    }
    if (action !== "authenticate") return Response.json({ error: "invalid" }, { status: 404 });
    const userId = await finishPasskeyAuthentication(db, body.challengeId, body.response);
    const jar = await cookies();
    const pendingId = jar.get("cura_mfa")?.value ?? "";
    const result = await finishPasskeyLogin(pendingId, userId);
    if (result.status !== "session") return Response.json({ error: "mfa" }, { status: 403 });
    const response = withSession(NextResponse.json({ ok: true }), result.sessionId);
    response.cookies.set("cura_mfa", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch {
    return Response.json({ error: "invalid" }, { status: 400 });
  }
}
