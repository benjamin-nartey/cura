import { createObservationSubscription, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    createObservationSubscription(getDb(), ctx, formId(form.get("idempotencyKey")));
    return redirectTo(request, "/interop", { notice: "subscribed" });
  } catch (error) {
    return redirectTo(request, "/interop", { error: failureCode(error) });
  }
}
