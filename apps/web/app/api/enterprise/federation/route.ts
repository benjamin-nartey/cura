import { getDb, recordFederation } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const endpoint = String(form.get("endpoint") ?? "");
  try {
    recordFederation(getDb(), ctx, { endpoint, idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/enterprise", { notice: "empfederation" });
  } catch (error) {
    return redirectTo(request, "/enterprise", { error: failureCode(error) });
  }
}
