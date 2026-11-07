import { getDb, recordPlan } from "@curasphere/domain";
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
  const ownerUserId = String(form.get("ownerUserId") ?? "");
  const dueOn = String(form.get("dueOn") ?? "");
  try {
    const created = recordPlan(getDb(), masterActor(ctx), {
      patientId,
      encounterId,
      practitionerId: String(form.get("practitionerId") ?? ""),
      code,
      ownerUserId,
      dueOn,
      idempotencyKey: sourceKey(["work-plan", patientId, encounterId, code, ownerUserId, dueOn]),
    });
    return redirectTo(request, `/work/plans/${created.id}`, { notice: "plan-saved" });
  } catch (error) {
    return redirectTo(request, "/work", { patient: patientId, encounter: encounterId, error: sourceError(error) });
  }
}
