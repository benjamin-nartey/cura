import { getDb, recordCondition } from "@curasphere/domain";
import { sourceError, sourceKey } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request) {
  const ctx = await requireSession();
  const form = await request.formData();
  const patientId = String(form.get("patientId") ?? "");
  const encounterId = String(form.get("encounterId") ?? "");
  try {
    recordCondition(getDb(), masterActor(ctx), {
      patientId,
      encounterId,
      practitionerId: String(form.get("practitionerId") ?? ""),
      code: String(form.get("code") ?? ""),
      clinicalStatus: String(form.get("clinicalStatus") ?? ""),
      verificationStatus: String(form.get("verificationStatus") ?? ""),
      onsetDate: String(form.get("onsetDate") ?? "") || undefined,
      idempotencyKey: sourceKey(["condition", patientId, encounterId, String(form.get("code") ?? ""), String(form.get("verificationStatus") ?? "")]),
    });
    return redirectTo(request, "/clinical", { patient: patientId, encounter: encounterId, notice: "condition-saved" });
  } catch (error) {
    return redirectTo(request, "/clinical", { patient: patientId, encounter: encounterId, error: sourceError(error) });
  }
}
