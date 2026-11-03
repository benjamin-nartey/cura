import { correctObservation, getDb } from "@curasphere/domain";
import { sourceError, sourceKey } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await context.params;
  const form = await request.formData();
  const expectedVersion = Number(form.get("expectedVersion"));
  const value = form.get("valueQuantity");
  const systolic = form.get("systolic");
  const diastolic = form.get("diastolic");
  const reason = String(form.get("reason") ?? "");
  try {
    correctObservation(getDb(), masterActor(ctx), id, {
      expectedVersion,
      valueQuantity: value === null || value === "" ? undefined : Number(value),
      components: systolic && diastolic ? [{ code: "syn-sbp", value: Number(systolic) }, { code: "syn-dbp", value: Number(diastolic) }] : undefined,
      reason,
      idempotencyKey: sourceKey(["correct", id, String(expectedVersion), String(value ?? systolic ?? ""), reason]),
    });
    return redirectTo(request, `/clinical/observations/${id}`, { notice: "source-corrected" });
  } catch (error) {
    return redirectTo(request, `/clinical/observations/${id}/correct`, { error: sourceError(error) });
  }
}
