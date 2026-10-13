import { getDb, recordInventory, ValidationError } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    const raw = String(form.get("onHand") ?? "");
    if (!/^\d+$/.test(raw)) throw new ValidationError();
    recordInventory(getDb(), ctx, { label: String(form.get("label") ?? ""), onHand: Number(raw), idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/operations", { notice: "stocked" });
  } catch (error) {
    return redirectTo(request, "/operations", { error: failureCode(error) });
  }
}
