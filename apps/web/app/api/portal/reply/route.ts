import { getDb, replyToPatient } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  try {
    replyToPatient(getDb(), ctx, { patientId, body: String(form.get("body") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, back, { notice: "replied" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
