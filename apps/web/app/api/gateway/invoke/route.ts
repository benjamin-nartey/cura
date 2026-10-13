import { GATEWAY_PROMPT, getDb, invokeGateway } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const promptId = formId(form.get("promptId"));
  const promptVersion = Number(form.get("promptVersion"));
  if (promptId !== GATEWAY_PROMPT.id || promptVersion !== GATEWAY_PROMPT.version) {
    return redirectTo(request, "/gateway", { error: "invalid" });
  }
  try {
    const result = invokeGateway(getDb(), ctx, {
      promptId,
      promptVersion,
      text: String(form.get("text") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/gateway", { trace: result.traceId });
  } catch (error) {
    return redirectTo(request, "/gateway", { error: failureCode(error) });
  }
}
