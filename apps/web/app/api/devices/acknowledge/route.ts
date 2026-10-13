import { acknowledgeDeviceAlert, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    acknowledgeDeviceAlert(getDb(), ctx, {
      alertId: String(form.get("alertId") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/devices", { notice: "devacked" });
  } catch (error) {
    return redirectTo(request, "/devices", { error: failureCode(error) });
  }
}
