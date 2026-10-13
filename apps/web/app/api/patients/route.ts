import type { Sex } from "@curasphere/contracts";
import { getDb, mirrorPatient } from "@curasphere/domain";
import { registerFoundationPatient } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const sex = String(form.get("sex") ?? "") as Sex;
  const registered = await registerFoundationPatient(ctx.sessionId, {
    givenName: String(form.get("givenName") ?? ""),
    familyName: String(form.get("familyName") ?? ""),
    birthDate: String(form.get("birthDate") ?? ""),
    sex,
    idempotencyKey: formId(form.get("idempotencyKey")),
  });
  if (registered.status === "unavailable") return redirectTo(request, "/patients", { error: "foundation" });
  if (registered.status !== "ok") return redirectTo(request, "/patients", { error: registered.status });
  try {
    mirrorPatient(getDb(), ctx, registered.patient);
    return redirectTo(request, `/patients/${registered.patient.id}`, { notice: "registered" });
  } catch (error) {
    return redirectTo(request, "/patients", { error: failureCode(error) });
  }
}
