import { getDb, submitReferral } from "@curasphere/domain";
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
  const toFacilityId = String(form.get("toFacilityId") ?? "");
  const dueOn = String(form.get("dueOn") ?? "");
  try {
    const created = submitReferral(getDb(), masterActor(ctx), {
      patientId,
      encounterId,
      practitionerId: String(form.get("practitionerId") ?? ""),
      code,
      toFacilityId,
      dueOn,
      idempotencyKey: sourceKey(["work-referral", patientId, encounterId, code, toFacilityId, dueOn]),
    });
    return redirectTo(request, `/work/referrals/${created.id}`, { notice: "referral-saved" });
  } catch (error) {
    return redirectTo(request, "/work", { patient: patientId, encounter: encounterId, error: sourceError(error) });
  }
}
