import { getDb, recordBed } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  try {
    recordBed(getDb(), ctx, {
      label: String(form.get("label") ?? ""),
      status: String(form.get("status") ?? ""),
      patientId: patientId || undefined,
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/facility", { notice: "bedded" });
  } catch (error) {
    return redirectTo(request, "/facility", { error: failureCode(error) });
  }
}
