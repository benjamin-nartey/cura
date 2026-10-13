import { explainMarketplace, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    explainMarketplace(getDb(), ctx, { idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/marketplace", { notice: "mktexplained" });
  } catch (error) {
    return redirectTo(request, "/marketplace", { error: failureCode(error) });
  }
}
