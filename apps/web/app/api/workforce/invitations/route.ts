import { devDirectoryEnabled, getDb, inviteWorkforce, listInvitations, workforceActor } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { failureCode, formId, redirectTo } from "@/lib/http";
import { optionalSession } from "@/lib/session";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Boolean(host && new URL(origin).host === host);
}

export async function GET() {
  const ctx = await optionalSession();
  if (!ctx) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    return NextResponse.json({ invitations: listInvitations(getDb(), workforceActor(ctx)) });
  } catch {
    return NextResponse.json({ error: "This action is not available." }, { status: 403 });
  }
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return NextResponse.json({ error: "This action is not available." }, { status: 403 });
  const ctx = await optionalSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const facilityId = formId(form.get("facilityId"));
  try {
    const created = inviteWorkforce(getDb(), workforceActor(ctx), {
      email: String(form.get("email") ?? ""),
      roleId: formId(form.get("roleId")) || "nurse",
      facilityIds: facilityId ? [facilityId] : [],
      idempotencyKey: formId(form.get("idempotencyKey")) || `inv-${Date.now().toString(36)}`,
      reason: String(form.get("reason") ?? "staffing").slice(0, 200),
    });
    const response = redirectTo(request, "/workforce/invitations", { notice: created.replayed ? "replayed" : "invited" });
    if (created.token && devDirectoryEnabled()) {
      response.cookies.set("cura_invite_once", created.token, { httpOnly: true, sameSite: "lax", path: "/workforce/invitations", maxAge: 120 });
    }
    return response;
  } catch (error) {
    return redirectTo(request, "/workforce/invite", { error: failureCode(error) });
  }
}
