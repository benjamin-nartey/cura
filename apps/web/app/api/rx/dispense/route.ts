import { dispenseRx, getDb } from "@curasphere/domain";
import { dispenseFoundationPrescription } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const orderId = formId(form.get("orderId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  try {
    const dispensed = await dispenseFoundationPrescription(ctx.sessionId, patientId, orderId, {
      quantity: Number(form.get("quantity")),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    if (dispensed.status !== "ok") {
      return redirectTo(request, back, { error: dispensed.status === "unavailable" ? "foundation" : dispensed.status });
    }
    dispenseRx(getDb(), ctx, {
      orderId,
      quantity: dispensed.dispense.quantity,
      idempotencyKey: formId(form.get("idempotencyKey")),
      dispenseId: dispensed.dispense.id,
    });
    return redirectTo(request, back, { notice: "dispensed" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
