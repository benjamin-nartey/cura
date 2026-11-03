import { createLegalHold, getDb } from "@curasphere/domain";
import { requireRetentionSession, retentionActor, retentionFailure } from "@/lib/retention";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await requireRetentionSession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  const kind = form.get("scopeKind") === "category" ? "category" : "resource";
  try {
    const created = createLegalHold(getDb(), retentionActor(ctx), {
      matterRef: String(form.get("matterRef") ?? ""),
      scopeKind: kind,
      scopeRef: String(form.get("scopeRef") ?? ""),
      reasonCode: String(form.get("reasonCode") ?? ""),
      authorityRef: String(form.get("authorityRef") ?? ""),
      idempotencyKey: String(form.get("idempotencyKey") ?? ""),
    });
    return redirectTo(request, `/privacy/retention/holds/${created.id}`);
  } catch (error) {
    return retentionFailure(request, error, "/privacy/retention/holds/new");
  }
}
