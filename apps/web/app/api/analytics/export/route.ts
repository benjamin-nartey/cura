import { exportAnalytics, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    exportAnalytics(getDb(), ctx, { metricId: String(form.get("metricId") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/analytics", { notice: "anexported" });
  } catch (error) {
    return redirectTo(request, "/analytics", { error: failureCode(error) });
  }
}
