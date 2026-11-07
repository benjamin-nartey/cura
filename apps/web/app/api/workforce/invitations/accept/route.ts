import { acceptInvitation, getDb } from "@curasphere/domain";
import { failureCode, redirectTo } from "@/lib/http";
import { optionalSession } from "@/lib/session";

export async function POST(request: Request) {
  const ctx = await optionalSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const linked = Boolean(getDb().prepare("SELECT id FROM external_identities WHERE user_id = ? AND status = 'active'").get(ctx.userId));
  try {
    acceptInvitation(getDb(), { token: String(form.get("token") ?? ""), userId: ctx.userId, externalLinked: linked });
    return redirectTo(request, "/workforce", { notice: "accepted" });
  } catch (error) {
    return redirectTo(request, "/workforce/accept", { error: failureCode(error) });
  }
}
