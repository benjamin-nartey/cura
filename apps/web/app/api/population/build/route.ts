import { buildPopulation, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    buildPopulation(getDb(), ctx, formId(form.get("idempotencyKey")));
    return redirectTo(request, "/population", { notice: "popbuilt" });
  } catch (error) {
    return redirectTo(request, "/population", { error: failureCode(error) });
  }
}
