import { getDb, prescribeMedication } from "@curasphere/domain";
import { proposeFoundationPrescription } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  try {
    const proposed = await proposeFoundationPrescription(ctx.sessionId, patientId, {
      formularyId: formId(form.get("formularyId")),
      dose: String(form.get("dose") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    if (proposed.status !== "ok") {
      return redirectTo(request, back, { error: proposed.status === "unavailable" ? "foundation" : proposed.status });
    }
    prescribeMedication(getDb(), ctx, {
      patientId,
      formularyId: proposed.order.formularyId,
      dose: proposed.order.dose,
      idempotencyKey: formId(form.get("idempotencyKey")),
      orderId: proposed.order.id,
      warningIds: proposed.order.warnings.map((warning) => warning.id),
    });
    return redirectTo(request, back, { notice: "prescribed" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
