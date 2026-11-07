import { createCharge, getDb } from "@curasphere/domain";
import { sourceError } from "@/lib/clinical";
import { billingKey } from "@/lib/billing";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request) {
  const ctx = await requireSession();
  const form = await request.formData();
  const patientId = String(form.get("patientId") ?? "");
  const encounterId = String(form.get("encounterId") ?? "");
  const catalogId = String(form.get("catalogId") ?? "");
  const quantity = Number(form.get("quantity") ?? 0);
  try {
    const created = createCharge(getDb(), masterActor(ctx), {
      patientId,
      encounterId,
      catalogId,
      quantity,
      idempotencyKey: billingKey(["bill-charge", ctx.organizationId, ctx.facilityId ?? "", ctx.userId, String(form.get("submissionKey") ?? ""), patientId, encounterId, catalogId, String(quantity)]),
    });
    return redirectTo(request, `/billing/charges/${created.id}`, { notice: "charge-saved" });
  } catch (error) {
    return redirectTo(request, "/billing", { patient: patientId, error: sourceError(error) });
  }
}
