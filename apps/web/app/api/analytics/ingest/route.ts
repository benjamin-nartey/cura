import { getDb, ingestAnalytics } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    ingestAnalytics(getDb(), ctx, formId(form.get("idempotencyKey")));
    return redirectTo(request, "/analytics", { notice: "aningested" });
  } catch (error) {
    return redirectTo(request, "/analytics", { error: failureCode(error) });
  }
}
