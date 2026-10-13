import { clearModule, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    clearModule(getDb(), ctx, { moduleId: String(form.get("moduleId") ?? ""), decision: String(form.get("decision") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/modules", { notice: "modstored" });
  } catch (error) {
    return redirectTo(request, "/modules", { error: failureCode(error) });
  }
}
