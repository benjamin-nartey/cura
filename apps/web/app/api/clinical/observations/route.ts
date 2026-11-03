import { codingCommandKey, codingSelectionFromForm } from "@/lib/clinical-coding";
import { terminologySameOrigin } from "@/lib/terminology-registry";
import { facilityClock, getDb, localToUtc, recordSourceObservation } from "@curasphere/domain";
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
  const effectiveLocal = String(form.get("effectiveAt") ?? "");
  const clock = facilityClock(getDb(), masterActor(ctx));
  const effectiveAt = effectiveLocal.includes("T") ? localToUtc(effectiveLocal.slice(0, 10), effectiveLocal.slice(11, 16), clock?.timezone ?? "UTC") : effectiveLocal;
  const value = form.get("valueQuantity");
  const systolic = form.get("systolic");
  const diastolic = form.get("diastolic");
  try {
    const coding=codingSelectionFromForm(form);
    const created = recordSourceObservation(getDb(), masterActor(ctx), {
      coding,
      patientId,
      encounterId,
      practitionerId: String(form.get("practitionerId") ?? ""),
      code,
      valueQuantity: code === "syn-bp" || value === null || value === "" ? undefined : Number(value),
      components: code === "syn-bp" ? [{ code: "syn-sbp", value: Number(systolic) }, { code: "syn-dbp", value: Number(diastolic) }] : undefined,
      status: "final",
      effectiveAt,
      idempotencyKey: codingCommandKey(form),
    });
    return redirectTo(request, `/clinical/observations/${created.id}`, { notice: "vital-saved" });
  } catch (error) {
    return redirectTo(request, "/clinical", { patient: patientId, encounter: encounterId, error: sourceError(error) });
  }
}
