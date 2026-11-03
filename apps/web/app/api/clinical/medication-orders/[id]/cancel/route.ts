import { cancelMedicationDraft, getDb } from "@curasphere/domain";
import { sourceError, sourceKey } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await context.params;
  const form = await request.formData();
  const expectedVersion = Number(form.get("expectedVersion"));
  const reason = String(form.get("reason") ?? "");
  try {
    cancelMedicationDraft(getDb(), masterActor(ctx), id, { expectedVersion, reason, idempotencyKey: sourceKey(["cancel", id, String(expectedVersion), reason]) });
    return redirectTo(request, `/clinical/medications/${id}`, { notice: "order-cancelled" });
  } catch (error) {
    return redirectTo(request, `/clinical/medications/${id}`, { error: sourceError(error) });
  }
}
