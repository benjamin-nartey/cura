import { explainRevenue, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    explainRevenue(getDb(), ctx, { idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/revenue", { notice: "revexplained" });
  } catch (error) {
    return redirectTo(request, "/revenue", { error: failureCode(error) });
  }
}
