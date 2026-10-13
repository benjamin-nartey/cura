import { getDb, issueOauthClient } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    issueOauthClient(getDb(), ctx, {
      secret: String(form.get("secret") ?? ""),
      redirectUri: String(form.get("redirectUri") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/marketplace", { notice: "mktlisted" });
  } catch (error) {
    return redirectTo(request, "/marketplace", { error: failureCode(error) });
  }
}
