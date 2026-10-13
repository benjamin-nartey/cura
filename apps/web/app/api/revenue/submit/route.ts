import { getDb, submitClaim } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    submitClaim(getDb(), ctx, { claimId: String(form.get("claimId") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/revenue", { notice: "revsubmit" });
  } catch (error) {
    return redirectTo(request, "/revenue", { error: failureCode(error) });
  }
}
