import { getDb, recordModuleStudy } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordModuleStudy(getDb(), ctx, { moduleId: String(form.get("moduleId") ?? ""), result: String(form.get("result") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/modules", { notice: "modstudy" });
  } catch (error) {
    return redirectTo(request, "/modules", { error: failureCode(error) });
  }
}
