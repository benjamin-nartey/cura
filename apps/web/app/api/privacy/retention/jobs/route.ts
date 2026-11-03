import { executeDryRun, getDb } from "@curasphere/domain";
import { ConflictError } from "@curasphere/domain";
import { requireRetentionSession, retentionActor, retentionFailure } from "@/lib/retention";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await requireRetentionSession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  const dryRunId = String(form.get("dryRunId") ?? "");
  const mode = form.get("mode") === "archive" ? "archive" : "dispose";
  try {
    const result = executeDryRun(getDb(), retentionActor(ctx), dryRunId, String(form.get("idempotencyKey") ?? ""), mode);
    const blocked = "blocked" in result ? result.blocked : 0;
    const notice = result.success > 0 ? (mode === "archive" ? "archived" : "disposed") : blocked > 0 ? "blocked" : "unchanged";
    return redirectTo(request, "/privacy/retention/dry-run", { id: dryRunId, notice });
  } catch (error) {
    if (error instanceof ConflictError) return redirectTo(request, "/privacy/retention/dry-run", { id: dryRunId, error: "conflict" });
    return retentionFailure(request, error, "/privacy/retention/dry-run");
  }
}
