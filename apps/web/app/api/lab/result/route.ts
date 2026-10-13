import { getDb, mirrorObservation, readLabOrderForResult, recordLabResult } from "@curasphere/domain";
import { recordFoundationLabResult, recordFoundationObservation } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const orderId = formId(form.get("orderId"));
  const key = formId(form.get("idempotencyKey"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  try {
    const target = readLabOrderForResult(getDb(), ctx, orderId);
    const recorded = await recordFoundationObservation(ctx.sessionId, target.patientId, {
      code: target.code,
      value: Number(form.get("value")),
      idempotencyKey: key,
    });
    if (recorded.status !== "ok") {
      return redirectTo(request, back, { error: recorded.status === "unavailable" ? "foundation" : recorded.status });
    }
    const resulted = await recordFoundationLabResult(ctx.sessionId, recorded.observation.patientId, orderId, {
      value: recorded.observation.value,
      observationId: recorded.observation.id,
      idempotencyKey: `l${key}`,
    });
    if (resulted.status !== "ok") {
      return redirectTo(request, back, { error: resulted.status === "unavailable" ? "foundation" : resulted.status });
    }
    mirrorObservation(getDb(), ctx, recorded.observation);
    recordLabResult(getDb(), ctx, {
      orderId,
      value: recorded.observation.value,
      idempotencyKey: key,
      observationId: recorded.observation.id,
      resultId: resulted.result.id,
      ...(resulted.result.alertId ? { alertId: resulted.result.alertId } : {}),
    });
    return redirectTo(request, back, { notice: "resulted" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
