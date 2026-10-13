import { getDb, recordReleaseAttempt } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordReleaseAttempt(getDb(), ctx, { dossierId: String(form.get("dossierId") ?? ""), decision: String(form.get("decision") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/release-train", { notice: "rtheld" });
  } catch (error) {
    return redirectTo(request, "/release-train", { error: failureCode(error) });
  }
}
