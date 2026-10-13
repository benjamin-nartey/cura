import { getDb, recordPatientPayment } from "@curasphere/domain";
import { currentPortal, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentPortal();
  if (!ctx) return redirectTo(request, "/portal");
  const form = await request.formData();
  const amount = Number(form.get("amountCents"));
  try {
    recordPatientPayment(getDb(), ctx, {
      description: String(form.get("description") ?? ""),
      amountCents: amount,
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/portal/home", { notice: "recordedpay" });
  } catch (error) {
    return redirectTo(request, "/portal/home", { error: failureCode(error) });
  }
}
