import { getDb, placeLabOrder } from "@curasphere/domain";
import { recordFoundationLabOrder } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const recorded = await recordFoundationLabOrder(ctx.sessionId, patientId, {
    code: String(form.get("code") ?? ""),
    idempotencyKey: formId(form.get("idempotencyKey")),
  });
  if (recorded.status !== "ok") {
    return redirectTo(request, back, { error: recorded.status === "unavailable" ? "foundation" : recorded.status });
  }
  try {
    placeLabOrder(getDb(), ctx, {
      patientId: recorded.order.patientId,
      code: recorded.order.code,
      idempotencyKey: formId(form.get("idempotencyKey")),
      orderId: recorded.order.id,
    });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
  return redirectTo(request, back, { notice: "ordered" });
}
