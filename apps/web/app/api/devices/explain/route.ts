import { explainDevice, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    explainDevice(getDb(), ctx, {
      deviceId: String(form.get("deviceId") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/devices", { notice: "devexplained" });
  } catch (error) {
    return redirectTo(request, "/devices", { error: failureCode(error) });
  }
}
