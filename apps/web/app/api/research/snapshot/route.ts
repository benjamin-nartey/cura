import { getDb, snapshotResearchDataset } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    snapshotResearchDataset(getDb(), ctx, { workspaceId: String(form.get("workspaceId") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/research", { notice: "resfrozen" });
  } catch (error) {
    return redirectTo(request, "/research", { error: failureCode(error) });
  }
}
