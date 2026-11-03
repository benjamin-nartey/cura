import { getDb, recordMedicationDraft } from "@curasphere/domain";
import { sourceError, sourceKey } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request) {
  const ctx = await requireSession();
  const form = await request.formData();
  const patientId = String(form.get("patientId") ?? "");
  const encounterId = String(form.get("encounterId") ?? "");
  const code = String(form.get("code") ?? "");
  const dose = Number(form.get("dose"));
  try {
    const created = recordMedicationDraft(getDb(), masterActor(ctx), {
      patientId,
      encounterId,
      practitionerId: String(form.get("practitionerId") ?? ""),
      code,
      dose,
      idempotencyKey: sourceKey(["draft", patientId, encounterId, code, String(dose)]),
    });
    return redirectTo(request, `/clinical/medications/${created.id}`, { notice: "draft-saved" });
  } catch (error) {
    return redirectTo(request, "/clinical", { patient: patientId, encounter: encounterId, error: sourceError(error) });
  }
}
