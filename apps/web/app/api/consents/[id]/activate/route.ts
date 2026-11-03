import { activateConsent, getDb } from "@curasphere/domain";
import { consentActor, consentFailure, requireConsentSession } from "@/lib/consent";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireConsentSession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    activateConsent(getDb(), consentActor(ctx), id, Number(form.get("expectedVersion") ?? 0));
    return redirectTo(request, `/consent/${id}`, { notice: "active" });
  } catch (error) {
    return consentFailure(request, error, `/consent/${id}`);
  }
}
