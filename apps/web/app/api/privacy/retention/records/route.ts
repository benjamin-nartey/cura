import { createRetentionRecord, getDb } from "@curasphere/domain";
import { requireRetentionSession, retentionActor, retentionFailure } from "@/lib/retention";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await requireRetentionSession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    const row = createRetentionRecord(getDb(), retentionActor(ctx), {
      category: String(form.get("category") ?? "temporary-admin"),
      retentionStart: String(form.get("retentionStart") ?? ""),
      idempotencyKey: String(form.get("idempotencyKey") ?? ""),
    });
    return redirectTo(request, `/privacy/retention/records/${row.id}`);
  } catch (error) {
    return retentionFailure(request, error, "/privacy/retention");
  }
}
