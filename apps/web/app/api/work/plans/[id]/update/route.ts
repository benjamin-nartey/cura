import { getDb, updatePlan } from "@curasphere/domain";
import { sourceError, sourceKey } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await context.params;
  const form = await request.formData();
  const expectedVersion = String(form.get("expectedVersion") ?? "");
  const status = String(form.get("status") ?? "");
  const reason = String(form.get("reason") ?? "");
  try {
    updatePlan(getDb(), masterActor(ctx), id, { expectedVersion: Number(expectedVersion), status, reason, idempotencyKey: sourceKey(["work-plan-update", id, expectedVersion, status, reason]) });
    return redirectTo(request, `/work/plans/${id}`, { notice: "plan-updated" });
  } catch (error) {
    return redirectTo(request, `/work/plans/${id}`, { error: sourceError(error) });
  }
}
