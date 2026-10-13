import { getDb, sendPatientMessage } from "@curasphere/domain";
import { currentPortal, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentPortal();
  if (!ctx) return redirectTo(request, "/portal");
  const form = await request.formData();
  try {
    sendPatientMessage(getDb(), ctx, { body: String(form.get("body") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/portal/home", { notice: "messaged" });
  } catch (error) {
    return redirectTo(request, "/portal/home", { error: failureCode(error) });
  }
}
