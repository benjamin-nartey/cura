import { activateRxOrder, getDb, readActivatableRxOrder } from "@curasphere/domain";
import { recordFoundationMedication, recordFoundationPrescription } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const idempotencyKey = formId(form.get("idempotencyKey"));
  try {
    const pending = readActivatableRxOrder(getDb(), ctx, formId(form.get("orderId")));
    const recorded = await recordFoundationMedication(ctx.sessionId, pending.patientId, {
      display: pending.display,
      dose: pending.dose,
      idempotencyKey,
    });
    if (recorded.status !== "ok") {
      return redirectTo(request, back, { error: recorded.status === "unavailable" ? "foundation" : recorded.status });
    }
    const activated = await recordFoundationPrescription(ctx.sessionId, pending.patientId, pending.orderId, {
      medicationId: recorded.medication.id,
      idempotencyKey: `a${idempotencyKey}`,
    });
    if (activated.status !== "ok") {
      return redirectTo(request, back, { error: activated.status === "unavailable" ? "foundation" : activated.status });
    }
    activateRxOrder(getDb(), ctx, {
      orderId: pending.orderId,
      medicationId: recorded.medication.id,
      idempotencyKey,
    });
    return redirectTo(request, back, { notice: "activated" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
