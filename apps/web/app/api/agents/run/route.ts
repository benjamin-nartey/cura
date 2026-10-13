import { CHART_AGENT, getDb, startAgentRun } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  try {
    const result = startAgentRun(getDb(), ctx, {
      agentId: CHART_AGENT.id,
      agentVersion: CHART_AGENT.version,
      patientId,
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/agents", { run: result.runId, notice: "queued" });
  } catch (error) {
    return redirectTo(request, "/agents", { error: failureCode(error) });
  }
}
