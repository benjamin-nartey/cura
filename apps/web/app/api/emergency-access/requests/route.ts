import { getDb, requestEmergency, seedDemoTenants, SYNTHETIC_RESOURCE_ID } from "@curasphere/domain";
import { failureCode, formId, redirectTo } from "@/lib/http";
import { denied, emergencyCaller, sameOrigin } from "@/lib/emergency-http";

export async function POST(request: Request) {
  if (!sameOrigin(request)) return denied();
  const caller = await emergencyCaller();
  if (!caller) return redirectTo(request, "/");
  const form = await request.formData();
  if (form.get("acknowledge") !== "yes") return redirectTo(request, "/emergency/justify", { error: "invalid" });
  seedDemoTenants(getDb());
  try {
    const created = requestEmergency(getDb(), caller.actor, {
      resourceId: SYNTHETIC_RESOURCE_ID,
      reasonCategory: formId(form.get("reasonCategory")) || "emergency-treatment",
      justification: String(form.get("justification") ?? "").slice(0, 500),
      durationSeconds: Number(form.get("durationSeconds") ?? 600),
      idempotencyKey: formId(form.get("idempotencyKey")) || `erg-${Date.now().toString(36)}`,
    }) as { id: string };
    return redirectTo(request, `/emergency/verify/${created.id}`);
  } catch (error) {
    return redirectTo(request, "/emergency/justify", { error: failureCode(error) });
  }
}
