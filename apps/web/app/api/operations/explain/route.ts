import { explainOperations, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    explainOperations(getDb(), ctx, { idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/operations", { notice: "opsexplained" });
  } catch (error) {
    return redirectTo(request, "/operations", { error: failureCode(error) });
  }
}
