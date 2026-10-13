import { getDb, mirrorEncounter } from "@curasphere/domain";
import { openFoundationEncounter } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const opened = await openFoundationEncounter(ctx.sessionId, {
    patientId,
    reason: String(form.get("reason") ?? ""),
    idempotencyKey: formId(form.get("idempotencyKey")),
  });
  if (opened.status === "unavailable") return redirectTo(request, back, { error: "foundation" });
  if (opened.status !== "ok") return redirectTo(request, back, { error: opened.status });
  try {
    mirrorEncounter(getDb(), ctx, opened.encounter);
    return redirectTo(request, back, { notice: "opened" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
