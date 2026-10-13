import { getDb, setOutreachPreference } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  try {
    setOutreachPreference(getDb(), ctx, {
      patientId,
      locale: formId(form.get("locale")),
      channel: formId(form.get("channel")),
      consent: formId(form.get("consent")),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, back, { notice: "preferred" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
