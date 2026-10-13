import { getDb, registerDevice } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    registerDevice(getDb(), ctx, {
      patientId: String(form.get("patientId") ?? ""),
      kind: String(form.get("kind") ?? ""),
      label: String(form.get("label") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/devices", { notice: "devregistered" });
  } catch (error) {
    return redirectTo(request, "/devices", { error: failureCode(error) });
  }
}
