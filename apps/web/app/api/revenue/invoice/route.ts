import { getDb, recordInvoice } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordInvoice(getDb(), ctx, {
      facilityId: String(form.get("facilityId") ?? ""),
      patientId: String(form.get("patientId") ?? ""),
      serviceLabel: String(form.get("serviceLabel") ?? ""),
      amountCents: Number(form.get("amountCents")),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/revenue", { notice: "revinvoice" });
  } catch (error) {
    return redirectTo(request, "/revenue", { error: failureCode(error) });
  }
}
