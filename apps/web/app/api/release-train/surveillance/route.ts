import { getDb, recordSurveillance } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordSurveillance(getDb(), ctx, { dossierId: String(form.get("dossierId") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/release-train", { notice: "rtsurveil" });
  } catch (error) {
    return redirectTo(request, "/release-train", { error: failureCode(error) });
  }
}
