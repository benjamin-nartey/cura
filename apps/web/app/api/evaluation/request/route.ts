import { getDb, requestEvalApproval } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    requestEvalApproval(getDb(), ctx, { runId: String(form.get("runId") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/evaluation", { notice: "evalask" });
  } catch (error) {
    return redirectTo(request, "/evaluation", { error: failureCode(error) });
  }
}
