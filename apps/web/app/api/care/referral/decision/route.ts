import { decideReferral, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const decision = formId(form.get("decision"));
  try {
    decideReferral(getDb(), ctx, {
      referralId: formId(form.get("referralId")),
      decision,
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/coordination", { notice: decision === "accepted" ? "refaccepted" : "refdeclined" });
  } catch (error) {
    return redirectTo(request, "/coordination", { error: failureCode(error) });
  }
}
