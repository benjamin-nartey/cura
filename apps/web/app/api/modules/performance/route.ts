import { getDb, recordModulePerformance } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordModulePerformance(getDb(), ctx, {
      moduleId: String(form.get("moduleId") ?? ""),
      score: String(form.get("score") ?? ""),
      subgroup: String(form.get("subgroup") ?? ""),
      site: String(form.get("site") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/modules", { notice: "modperf" });
  } catch (error) {
    return redirectTo(request, "/modules", { error: failureCode(error) });
  }
}
