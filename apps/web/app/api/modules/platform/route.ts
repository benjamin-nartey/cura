import { approvePlatform, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const codes = String(form.get("codes") ?? "");
  try {
    approvePlatform(getDb(), ctx, { codes: codes ? codes.split(",") : [], idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/modules", { notice: "modstored" });
  } catch (error) {
    return redirectTo(request, "/modules", { error: failureCode(error) });
  }
}
