import { getDb, mirrorAllergy } from "@curasphere/domain";
import { recordFoundationAllergy } from "@/lib/foundation";
import { currentSession, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const criticality = form.get("criticality") === "high" ? "high" : "low";
  const recorded = await recordFoundationAllergy(ctx.sessionId, patientId, {
    display: String(form.get("display") ?? ""),
    reaction: String(form.get("reaction") ?? ""),
    criticality,
    idempotencyKey: formId(form.get("idempotencyKey")),
  });
  if (recorded.status !== "ok") {
    return redirectTo(request, back, { error: recorded.status === "unavailable" ? "foundation" : recorded.status });
  }
  mirrorAllergy(getDb(), ctx, recorded.allergy);
  return redirectTo(request, back, { notice: "allergy" });
}
