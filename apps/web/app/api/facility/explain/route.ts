import { explainFacility, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    explainFacility(getDb(), ctx, { idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/facility", { notice: "facexplained" });
  } catch (error) {
    return redirectTo(request, "/facility", { error: failureCode(error) });
  }
}
