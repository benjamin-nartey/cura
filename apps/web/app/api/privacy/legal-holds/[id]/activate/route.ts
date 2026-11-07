import { activateLegalHold, getDb } from "@curasphere/domain";
import { requireRetentionSession, retentionActor, retentionFailure } from "@/lib/retention";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireRetentionSession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    activateLegalHold(getDb(), retentionActor(ctx), id, Number(form.get("expectedVersion") ?? 0));
    return redirectTo(request, `/privacy/retention/holds/${id}`, { notice: "active" });
  } catch (error) {
    return retentionFailure(request, error, `/privacy/retention/holds/${id}`);
  }
}
