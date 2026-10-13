import { getDb, mirrorObservation } from "@curasphere/domain";
import { recordFoundationObservation } from "@/lib/foundation";
import { currentSession, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const recorded = await recordFoundationObservation(ctx.sessionId, patientId, {
    code: String(form.get("code") ?? ""),
    value: Number(form.get("value")),
    idempotencyKey: formId(form.get("idempotencyKey")),
  });
  if (recorded.status !== "ok") {
    return redirectTo(request, back, { error: recorded.status === "unavailable" ? "foundation" : recorded.status });
  }
  mirrorObservation(getDb(), ctx, recorded.observation);
  return redirectTo(request, back, { notice: "recorded" });
}
