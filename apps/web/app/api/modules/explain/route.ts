import { explainModule, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    explainModule(getDb(), ctx, { idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/modules", { notice: "modexplained" });
  } catch (error) {
    return redirectTo(request, "/modules", { error: failureCode(error) });
  }
}
