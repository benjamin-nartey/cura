import { getDb, queueConsentDispatch, readConsent } from "@curasphere/domain";
import { consentActor, consentFailure, requireConsentSession } from "@/lib/consent";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireConsentSession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    const row = readConsent(getDb(), consentActor(ctx), id);
    queueConsentDispatch(getDb(), consentActor(ctx), {
      subjectId: row.subject_id,
      action: row.action,
      recipient: row.recipient,
      resourceCategory: row.resource_category,
      idempotencyKey: String(form.get("idempotencyKey") ?? ""),
    });
    return redirectTo(request, `/consent/${id}`, { notice: "queued" });
  } catch (error) {
    return consentFailure(request, error, `/consent/${id}`);
  }
}
