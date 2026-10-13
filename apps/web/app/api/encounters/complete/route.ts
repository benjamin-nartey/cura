import { getDb, mirrorFinishedEncounter } from "@curasphere/domain";
import { finishFoundationEncounter } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const encounterId = formId(form.get("encounterId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const finished = await finishFoundationEncounter(ctx.sessionId, encounterId, {
    expectedVersion: Number(form.get("expectedVersion")),
    idempotencyKey: formId(form.get("idempotencyKey")),
  });
  if (finished.status === "unavailable") return redirectTo(request, back, { error: "foundation" });
  if (finished.status !== "ok") return redirectTo(request, back, { error: finished.status });
  try {
    mirrorFinishedEncounter(getDb(), ctx, finished.encounter);
    return redirectTo(request, back, { notice: "finished" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
