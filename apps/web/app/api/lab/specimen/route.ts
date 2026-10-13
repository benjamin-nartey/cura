import { collectLabSpecimen, getDb } from "@curasphere/domain";
import { recordFoundationSpecimen } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const orderId = formId(form.get("orderId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const recorded = await recordFoundationSpecimen(ctx.sessionId, patientId, orderId, {
    idempotencyKey: formId(form.get("idempotencyKey")),
  });
  if (recorded.status !== "ok") {
    return redirectTo(request, back, { error: recorded.status === "unavailable" ? "foundation" : recorded.status });
  }
  try {
    collectLabSpecimen(getDb(), ctx, {
      orderId: recorded.specimen.orderId,
      specimenId: recorded.specimen.id,
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
  return redirectTo(request, back, { notice: "collected" });
}
