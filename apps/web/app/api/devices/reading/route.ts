import { getDb, mirrorObservation, prepareDeviceReading, recordDeviceReading } from "@curasphere/domain";
import { recordFoundationObservation } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const idempotencyKey = formId(form.get("idempotencyKey"));
  try {
    const prepared = prepareDeviceReading(getDb(), ctx, {
      deviceId: String(form.get("deviceId") ?? ""),
      value: Number(form.get("value")),
      effectiveAt: String(form.get("effectiveAt") ?? ""),
      idempotencyKey,
    });
    const recorded = await recordFoundationObservation(ctx.sessionId, prepared.patientId, {
      code: prepared.code,
      value: prepared.value,
      effectiveAt: prepared.effectiveAt,
      idempotencyKey,
    });
    if (recorded.status !== "ok") {
      return redirectTo(request, "/devices", { error: recorded.status === "unavailable" ? "foundation" : recorded.status });
    }
    mirrorObservation(getDb(), ctx, recorded.observation);
    recordDeviceReading(getDb(), ctx, {
      deviceId: String(form.get("deviceId") ?? ""),
      value: recorded.observation.value,
      effectiveAt: recorded.observation.effectiveAt,
      idempotencyKey,
    });
    return redirectTo(request, "/devices", { notice: "devreading" });
  } catch (error) {
    return redirectTo(request, "/devices", { error: failureCode(error) });
  }
}
