import { getDb, openSandbox } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    openSandbox(getDb(), ctx, { name: String(form.get("name") ?? ""), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/marketplace", { notice: "mktlisted" });
  } catch (error) {
    return redirectTo(request, "/marketplace", { error: failureCode(error) });
  }
}
