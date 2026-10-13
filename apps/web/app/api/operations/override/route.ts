import { getDb, overrideOperations } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    overrideOperations(getDb(), ctx, {
      kind: String(form.get("kind") ?? ""),
      reason: String(form.get("reason") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/operations", { notice: "opsoverride" });
  } catch (error) {
    return redirectTo(request, "/operations", { error: failureCode(error) });
  }
}
