import { assertLocalHealthcareSandbox, CHART_AGENT, enqueueAgentRun, getDb, setAgentExecutionStopped, startAgentRun, stopAgentExecution } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";
import { sourceOrigin } from "@/lib/fhir-source";

export async function POST(request: Request) {
  if (!sourceOrigin(request)) return new Response(null,{status:403});
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  try {
    const action = form.get("action");
    if (action === "stop-execution" || action === "enable-execution") {
      setAgentExecutionStopped(getDb(),ctx,action === "stop-execution");
      return redirectTo(request,"/agents");
    }
    if (form.get("action") === "cancel") {
      assertLocalHealthcareSandbox();
      const runId = formId(form.get("runId"));
      stopAgentExecution(getDb(),ctx,runId,"cancelled");
      return redirectTo(request,"/agents",{run:runId});
    }
    const input = {
      agentId: CHART_AGENT.id,
      agentVersion: CHART_AGENT.version,
      patientId,
      idempotencyKey: formId(form.get("idempotencyKey")),
    };
    const db = getDb();
    if (process.env.CURASPHERE_AGENT_TEMPORAL === "true") {
      assertLocalHealthcareSandbox();
      const runId = enqueueAgentRun(db,ctx,input);
      return redirectTo(request,"/agents",{run:runId,notice:"queued"});
    }
    const result = startAgentRun(db,ctx,input);
    return redirectTo(request,"/agents",{run:result.runId,notice:"queued"});
  } catch (error) {
    return redirectTo(request, "/agents", { error: failureCode(error) });
  }
}
