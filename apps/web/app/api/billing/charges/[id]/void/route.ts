import { getDb, voidCharge } from "@curasphere/domain";
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
  const reason = String(form.get("reason") ?? "");
  try {
    voidCharge(getDb(), masterActor(ctx), id, { expectedVersion: Number(expectedVersion), reason, idempotencyKey: billingKey(["bill-void", id, expectedVersion, reason]) });
    return redirectTo(request, `/billing/charges/${id}`, { notice: "charge-voided" });
  } catch (error) {
    return redirectTo(request, `/billing/charges/${id}`, { error: sourceError(error) });
  }
}
