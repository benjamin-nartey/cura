import { getDb, runEvaluation } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    runEvaluation(getDb(), ctx, { datasetId: String(form.get("datasetId") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/evaluation", { notice: "evalrun" });
  } catch (error) {
    return redirectTo(request, "/evaluation", { error: failureCode(error) });
  }
}
