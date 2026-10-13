import { getDb, recordEligibility } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordEligibility(getDb(), ctx, {
      facilityId: String(form.get("facilityId") ?? ""),
      patientId: String(form.get("patientId") ?? ""),
      payerLabel: String(form.get("payerLabel") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/revenue", { notice: "reveligibility" });
  } catch (error) {
    return redirectTo(request, "/revenue", { error: failureCode(error) });
  }
}
