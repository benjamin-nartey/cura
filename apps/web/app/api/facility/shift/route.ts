import { getDb, recordShift } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordShift(getDb(), ctx, {
      userId: formId(form.get("userId")),
      startsAt: String(form.get("startsAt") ?? ""),
      endsAt: String(form.get("endsAt") ?? ""),
      status: String(form.get("status") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/facility", { notice: "shifted" });
  } catch (error) {
    return redirectTo(request, "/facility", { error: failureCode(error) });
  }
}
