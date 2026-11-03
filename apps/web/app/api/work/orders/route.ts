import { getDb, submitOrder } from "@curasphere/domain";
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
  const departmentId = String(form.get("departmentId") ?? "");
  try {
    const created = submitOrder(getDb(), masterActor(ctx), {
      patientId,
      encounterId,
      practitionerId: String(form.get("practitionerId") ?? ""),
      code,
      departmentId,
      priority: String(form.get("priority") ?? ""),
      dueOn: String(form.get("dueOn") ?? ""),
      idempotencyKey: sourceKey(["work-order", patientId, encounterId, code, departmentId]),
    });
    return redirectTo(request, `/work/orders/${created.id}`, { notice: "work-saved" });
  } catch (error) {
    return redirectTo(request, "/work", { patient: patientId, encounter: encounterId, error: sourceError(error) });
  }
}
