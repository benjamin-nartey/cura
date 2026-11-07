import { amendMedicationDraft, getDb } from "@curasphere/domain";
import { sourceError, sourceKey } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await context.params;
  const form = await request.formData();
  const expectedVersion = Number(form.get("expectedVersion"));
  const dose = Number(form.get("dose"));
  const reason = String(form.get("reason") ?? "");
  try {
    amendMedicationDraft(getDb(), masterActor(ctx), id, { expectedVersion, dose, reason, idempotencyKey: sourceKey(["amend", id, String(expectedVersion), String(dose), reason]) });
    return redirectTo(request, `/clinical/medications/${id}`, { notice: "draft-amended" });
  } catch (error) {
    return redirectTo(request, `/clinical/medications/${id}`, { error: sourceError(error) });
  }
}
