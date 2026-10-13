import { claimCareTask, completeCareTask, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const action = formId(form.get("action"));
  try {
    const input = { taskId: formId(form.get("taskId")), idempotencyKey: formId(form.get("idempotencyKey")) };
    if (action === "complete") completeCareTask(getDb(), ctx, input);
    else claimCareTask(getDb(), ctx, input);
    return redirectTo(request, back, { notice: action === "complete" ? "taskdone" : "taskclaimed" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
