import { getDb, recordChangePlan } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordChangePlan(getDb(), ctx, { dossierId: String(form.get("dossierId") ?? ""), modelId: String(form.get("modelId") ?? ""), modelVersion: String(form.get("modelVersion") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/release-train", { notice: "rtchange" });
  } catch (error) {
    return redirectTo(request, "/release-train", { error: failureCode(error) });
  }
}
