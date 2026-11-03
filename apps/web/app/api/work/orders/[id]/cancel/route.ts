import { cancelOrder, getDb } from "@curasphere/domain";
import { sourceError, sourceKey } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await context.params;
  const form = await request.formData();
  const expectedVersion = String(form.get("expectedVersion") ?? "");
  const reason = String(form.get("reason") ?? "");
  try {
    cancelOrder(getDb(), masterActor(ctx), id, { expectedVersion: Number(expectedVersion), reason, idempotencyKey: sourceKey(["work-cancel", id, expectedVersion, reason]) });
    return redirectTo(request, `/work/orders/${id}`, { notice: "work-cancelled" });
  } catch (error) {
    return redirectTo(request, `/work/orders/${id}`, { error: sourceError(error) });
  }
}
