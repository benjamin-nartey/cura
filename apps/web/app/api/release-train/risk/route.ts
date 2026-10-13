import { getDb, recordRiskFile } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordRiskFile(getDb(), ctx, { dossierId: String(form.get("dossierId") ?? ""), signed: String(form.get("signed") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/release-train", { notice: "rtrisk" });
  } catch (error) {
    return redirectTo(request, "/release-train", { error: failureCode(error) });
  }
}
