import { getDb, recordModuleValidation } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordModuleValidation(getDb(), ctx, { moduleId: String(form.get("moduleId") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/modules", { notice: "modvalidated" });
  } catch (error) {
    return redirectTo(request, "/modules", { error: failureCode(error) });
  }
}
