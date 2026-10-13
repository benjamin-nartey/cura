import { askCopilot, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  try {
    const turn = askCopilot(getDb(), ctx, {
      patientId,
      question: String(form.get("question") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, back, { turn: turn.turnId, notice: turn.outcome === "grounded" ? "grounded" : "blocked" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
