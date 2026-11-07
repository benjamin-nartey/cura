import { codingCommandKey, codingSelectionFromForm } from "@/lib/clinical-coding";
import { terminologySameOrigin } from "@/lib/terminology-registry";
import { getDb, recordMedicationDraft } from "@curasphere/domain";
import { sourceError } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request) {
  if(!terminologySameOrigin(request))return new Response("Forbidden",{status:403});
  const ctx = await requireSession();
  const form = await request.formData();
  const patientId = String(form.get("patientId") ?? "");
  const encounterId = String(form.get("encounterId") ?? "");
  const code = String(form.get("code") ?? "");
  const dose = Number(form.get("dose"));
  try {
    const coding=codingSelectionFromForm(form);
    const created = recordMedicationDraft(getDb(), masterActor(ctx), {
      coding,
      patientId,
      encounterId,
      practitionerId: String(form.get("practitionerId") ?? ""),
      code,
      dose,
      idempotencyKey: codingCommandKey(form),
    });
    return redirectTo(request, `/clinical/medications/${created.id}`, { notice: "draft-saved" });
  } catch (error) {
    return redirectTo(request, "/clinical", { patient: patientId, encounter: encounterId, error: sourceError(error) });
  }
}
