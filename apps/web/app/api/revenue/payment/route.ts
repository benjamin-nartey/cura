import { getDb, recordRevenuePayment } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordRevenuePayment(getDb(), ctx, {
      invoiceId: String(form.get("invoiceId") ?? ""),
      amountCents: Number(form.get("amountCents")),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/revenue", { notice: "revpayment" });
  } catch (error) {
    return redirectTo(request, "/revenue", { error: failureCode(error) });
  }
}
