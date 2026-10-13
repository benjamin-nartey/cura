import { decideResearchExport, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    decideResearchExport(getDb(), ctx, {
      exportId: String(form.get("exportId") ?? ""),
      decision: String(form.get("decision") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/research", { notice: "resdecided" });
  } catch (error) {
    return redirectTo(request, "/research", { error: failureCode(error) });
  }
}
