import { getDb, mirrorCondition } from "@curasphere/domain";
import { recordFoundationCondition } from "@/lib/foundation";
import { currentSession, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const recorded = await recordFoundationCondition(ctx.sessionId, patientId, {
    code: String(form.get("code") ?? ""),
    idempotencyKey: formId(form.get("idempotencyKey")),
  });
  if (recorded.status !== "ok") {
    return redirectTo(request, back, { error: recorded.status === "unavailable" ? "foundation" : recorded.status });
  }
  mirrorCondition(getDb(), ctx, recorded.condition);
  return redirectTo(request, back, { notice: "problem" });
}
