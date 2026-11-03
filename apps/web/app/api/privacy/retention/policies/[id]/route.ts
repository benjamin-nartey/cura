import { getDb, updateRetentionPolicy } from "@curasphere/domain";
import { requireRetentionSession, retentionActor, retentionFailure } from "@/lib/retention";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireRetentionSession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    updateRetentionPolicy(getDb(), retentionActor(ctx), id, {
      duration: Number(form.get("duration") ?? 0),
      durationUnit: String(form.get("durationUnit") ?? "day"),
      expectedVersion: Number(form.get("expectedVersion") ?? 0),
    });
    return redirectTo(request, "/privacy/retention/policies", { notice: "saved" });
  } catch (error) {
    return retentionFailure(request, error, "/privacy/retention/policies");
  }
}
