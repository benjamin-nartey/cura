import { getDb, recordCopilotFeedback } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const rating = form.get("rating") === "not-grounded" ? "not-grounded" : form.get("rating") === "helpful" ? "helpful" : "";
  if (rating !== "helpful" && rating !== "not-grounded") return redirectTo(request, back, { error: "invalid" });
  try {
    recordCopilotFeedback(getDb(), ctx, {
      patientId,
      claimId: formId(form.get("claimId")),
      rating,
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, back, { notice: "noted" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
