import { getDb, recordApiGrant } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const audience = String(form.get("audience") ?? "");
  try {
    recordApiGrant(getDb(), ctx, { label: String(form.get("label") ?? ""), audience, idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/enterprise", { notice: "empgrant" });
  } catch (error) {
    return redirectTo(request, "/enterprise", { error: failureCode(error) });
  }
}
