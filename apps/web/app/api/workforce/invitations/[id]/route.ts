import { acceptInvitation, cancelInvitation, devDirectoryEnabled, getDb, resendInvitation, workforceActor } from "@curasphere/domain";
import { failureCode, formId, redirectTo } from "@/lib/http";
import { optionalSession } from "@/lib/session";

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Boolean(host && new URL(origin).host === host);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return redirectTo(request, "/workforce/invitations", { error: "forbidden" });
  const ctx = await optionalSession();
  if (!ctx) return redirectTo(request, "/");
  const { id } = await context.params;
  const invitationId = formId(id);
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const version = Number(form.get("version"));
  try {
    if (action === "cancel") cancelInvitation(getDb(), workforceActor(ctx), invitationId, version);
    else if (action === "resend") {
      const resent = resendInvitation(getDb(), workforceActor(ctx), invitationId, version);
      const response = redirectTo(request, "/workforce/invitations", { notice: "resend" });
      if (resent.token && devDirectoryEnabled()) {
        response.cookies.set("cura_invite_once", resent.token, { httpOnly: true, sameSite: "lax", path: "/workforce/invitations", maxAge: 120 });
      }
      return response;
    } else if (action === "accept") {
      const linked = Boolean(getDb().prepare("SELECT id FROM external_identities WHERE user_id = ? AND status = 'active'").get(ctx.userId));
      acceptInvitation(getDb(), { token: String(form.get("token") ?? ""), userId: ctx.userId, externalLinked: linked });
      return redirectTo(request, "/workforce", { notice: "accepted" });
    } else return redirectTo(request, "/workforce/invitations", { error: "invalid" });
    return redirectTo(request, "/workforce/invitations", { notice: action });
  } catch (error) {
    return redirectTo(request, "/workforce/invitations", { error: failureCode(error) });
  }
}
