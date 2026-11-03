import { finalizeCharge, getDb } from "@curasphere/domain";
import { sourceError } from "@/lib/clinical";
import { billingKey } from "@/lib/billing";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await context.params;
  const form = await request.formData();
  const expectedVersion = String(form.get("expectedVersion") ?? "");
  try {
    finalizeCharge(getDb(), masterActor(ctx), id, { expectedVersion: Number(expectedVersion), idempotencyKey: billingKey(["bill-final", id, expectedVersion]) });
    return redirectTo(request, `/billing/charges/${id}`, { notice: "charge-finalized" });
  } catch (error) {
    return redirectTo(request, `/billing/charges/${id}`, { error: sourceError(error) });
  }
}
