import { explainRx, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  try {
    explainRx(getDb(), ctx, {
      orderId: formId(form.get("orderId")),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, back, { notice: "rxexplained" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
