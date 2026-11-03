import { getDb, recordAllergy } from "@curasphere/domain";
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
  const criticality = String(form.get("criticality") ?? "");
  try {
    recordAllergy(getDb(), masterActor(ctx), {
      patientId,
      encounterId,
      practitionerId: String(form.get("practitionerId") ?? ""),
      code,
      verificationStatus: String(form.get("verificationStatus") ?? ""),
      criticality: criticality || undefined,
      idempotencyKey: sourceKey(["allergy", patientId, encounterId, code, criticality || "none"]),
    });
    return redirectTo(request, "/clinical", { patient: patientId, encounter: encounterId, notice: "allergy-saved" });
  } catch (error) {
    return redirectTo(request, "/clinical", { patient: patientId, encounter: encounterId, error: sourceError(error) });
  }
}
