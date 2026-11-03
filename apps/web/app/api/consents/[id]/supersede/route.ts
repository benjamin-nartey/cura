import { getDb, supersedeConsent } from "@curasphere/domain";
import { consentActor, consentFailure, requireConsentSession } from "@/lib/consent";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireConsentSession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    const created = supersedeConsent(getDb(), consentActor(ctx), id, Number(form.get("expectedVersion") ?? 0), String(form.get("idempotencyKey") ?? ""));
    return redirectTo(request, `/consent/${created.id}`);
  } catch (error) {
    return consentFailure(request, error, `/consent/${id}`);
  }
}
