import { getDb, storePatientQuestion } from "@curasphere/domain";
import { currentPortal, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentPortal();
  if (!ctx) return redirectTo(request, "/portal");
  const form = await request.formData();
  try {
    const result = storePatientQuestion(getDb(), ctx, { text: String(form.get("text") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/portal/home", { notice: result.outcome === "triage" ? "triaged" : "questioned" });
  } catch (error) {
    return redirectTo(request, "/portal/home", { error: failureCode(error) });
  }
}
