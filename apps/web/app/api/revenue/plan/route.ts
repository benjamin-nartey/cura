import { getDb, recordSubscription } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordSubscription(getDb(), ctx, { planLabel: String(form.get("planLabel") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/revenue", { notice: "revplan" });
  } catch (error) {
    return redirectTo(request, "/revenue", { error: failureCode(error) });
  }
}
