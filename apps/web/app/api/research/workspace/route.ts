import { getDb, openResearchWorkspace } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    openResearchWorkspace(getDb(), ctx, {
      title: String(form.get("title") ?? ""),
      protocolLabel: String(form.get("protocolLabel") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/research", { notice: "resopened" });
  } catch (error) {
    return redirectTo(request, "/research", { error: failureCode(error) });
  }
}
