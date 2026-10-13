import { getDb, signEvalApproval } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    signEvalApproval(getDb(), ctx, { approvalId: String(form.get("approvalId") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/evaluation", { notice: "evalsigned" });
  } catch (error) {
    return redirectTo(request, "/evaluation", { error: failureCode(error) });
  }
}
