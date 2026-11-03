import { codingCommandKey, codingSelectionFromForm } from "@/lib/clinical-coding";
import { terminologySameOrigin } from "@/lib/terminology-registry";
import { getDb, recordAllergy } from "@curasphere/domain";
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
  const criticality = String(form.get("criticality") ?? "");
  try {
    const coding=codingSelectionFromForm(form);
    recordAllergy(getDb(), masterActor(ctx), {
      coding,
      patientId,
      encounterId,
      practitionerId: String(form.get("practitionerId") ?? ""),
      code,
      verificationStatus: String(form.get("verificationStatus") ?? ""),
      criticality: criticality || undefined,
      idempotencyKey: codingCommandKey(form),
    });
    return redirectTo(request, "/clinical", { patient: patientId, encounter: encounterId, notice: "allergy-saved" });
  } catch (error) {
    return redirectTo(request, "/clinical", { patient: patientId, encounter: encounterId, error: sourceError(error) });
  }
}
