import { decideAgentApproval, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const decision = form.get("decision") === "declined" ? "declined" : form.get("decision") === "approved" ? "approved" : "";
  const runId = formId(form.get("runId"));
  if (decision !== "approved" && decision !== "declined") return redirectTo(request, "/agents", { error: "invalid", run: runId });
  try {
    const result = decideAgentApproval(getDb(), ctx, {
      approvalId: formId(form.get("approvalId")),
      decision,
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/agents", { run: result.runId, notice: decision });
  } catch (error) {
    return redirectTo(request, "/agents", { error: failureCode(error), run: runId });
  }
}
