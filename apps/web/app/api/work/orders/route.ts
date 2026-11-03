import { codingCommandKey, codingSelectionFromForm } from "@/lib/clinical-coding";
import { terminologySameOrigin } from "@/lib/terminology-registry";
import { getDb, submitOrder } from "@curasphere/domain";
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
  const departmentId = String(form.get("departmentId") ?? "");
  const catalogItemVersionId=String(form.get("catalogItemVersionId")??"");
  try {
    const coding=codingSelectionFromForm(form);
    const created = submitOrder(getDb(), masterActor(ctx), {
      coding,
      patientId,
      encounterId,
      practitionerId: String(form.get("practitionerId") ?? ""),
      code,
      catalogItemVersionId:catalogItemVersionId||undefined,
      departmentId,
      priority: String(form.get("priority") ?? ""),
      dueOn: String(form.get("dueOn") ?? ""),
      idempotencyKey: codingCommandKey(form),
    });
    return redirectTo(request, `/work/orders/${created.id}`, { notice: "work-saved" });
  } catch (error) {
    return redirectTo(request, "/work", { patient: patientId, encounter: encounterId, error: sourceError(error) });
  }
}
