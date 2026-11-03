import { getDb, releaseLegalHold } from "@curasphere/domain";
import { requireRetentionSession, retentionActor, retentionFailure } from "@/lib/retention";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireRetentionSession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    releaseLegalHold(getDb(), retentionActor(ctx), id, Number(form.get("expectedVersion") ?? 0), String(form.get("reasonCode") ?? ""));
    return redirectTo(request, `/privacy/retention/holds/${id}`, { notice: "released" });
  } catch (error) {
    return retentionFailure(request, error, `/privacy/retention/holds/${id}`);
  }
}
