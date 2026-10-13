import { getDb, recordRegionDrill } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordRegionDrill(getDb(), ctx, { idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/enterprise", { notice: "empdrill" });
  } catch (error) {
    return redirectTo(request, "/enterprise", { error: failureCode(error) });
  }
}
