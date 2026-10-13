import { getDb, registerListing } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    registerListing(getDb(), ctx, {
      label: String(form.get("label") ?? ""),
      scope: String(form.get("scope") ?? ""),
      risk: String(form.get("risk") ?? ""),
      secret: String(form.get("secret") ?? ""),
      redirectUri: String(form.get("redirectUri") ?? ""),
      manifest: String(form.get("manifest") ?? ""),
      compatibility: String(form.get("compatibility") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/marketplace", { notice: "mktlisted" });
  } catch (error) {
    return redirectTo(request, "/marketplace", { error: failureCode(error) });
  }
}
