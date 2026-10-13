import { administerRx, getDb } from "@curasphere/domain";
import { administerFoundationPrescription } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const orderId = formId(form.get("orderId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  try {
    const administered = await administerFoundationPrescription(ctx.sessionId, patientId, orderId, {
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    if (administered.status !== "ok") {
      return redirectTo(request, back, { error: administered.status === "unavailable" ? "foundation" : administered.status });
    }
    administerRx(getDb(), ctx, {
      orderId,
      idempotencyKey: formId(form.get("idempotencyKey")),
      administrationId: administered.administration.id,
    });
    return redirectTo(request, back, { notice: "administered" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
