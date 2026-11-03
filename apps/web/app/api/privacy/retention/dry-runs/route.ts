import { createDryRun, getDb } from "@curasphere/domain";
import { requireRetentionSession, retentionActor, retentionFailure } from "@/lib/retention";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await requireRetentionSession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    const created = createDryRun(getDb(), retentionActor(ctx), String(form.get("idempotencyKey") ?? ""));
    const id = "dryRunId" in created ? created.dryRunId : "";
    return redirectTo(request, "/privacy/retention/dry-run", { id: String(id), notice: "preview" });
  } catch (error) {
    return retentionFailure(request, error, "/privacy/retention/dry-run");
  }
}
