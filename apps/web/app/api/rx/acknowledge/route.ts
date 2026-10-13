import { acknowledgeRxWarning, getDb } from "@curasphere/domain";
import { acknowledgeFoundationWarning } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const orderId = formId(form.get("orderId"));
  const warningId = formId(form.get("warningId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  try {
    const acknowledged = await acknowledgeFoundationWarning(ctx.sessionId, patientId, orderId, warningId, {
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    if (acknowledged.status !== "ok") {
      return redirectTo(request, back, { error: acknowledged.status === "unavailable" ? "foundation" : acknowledged.status });
    }
    acknowledgeRxWarning(getDb(), ctx, {
      warningId,
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, back, { notice: "rxacked" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
