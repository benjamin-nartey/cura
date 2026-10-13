import { getDb, recordModule } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordModule(getDb(), ctx, {
      code: String(form.get("code") ?? ""),
      payload: String(form.get("payload") ?? ""),
      intendedUse: String(form.get("intendedUse") ?? ""),
      modelCard: String(form.get("modelCard") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/modules", { notice: "modstored" });
  } catch (error) {
    return redirectTo(request, "/modules", { error: failureCode(error) });
  }
}
