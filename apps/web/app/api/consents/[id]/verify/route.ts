import { getDb, verifyAuthority } from "@curasphere/domain";
import { consentActor, consentFailure, requireConsentSession } from "@/lib/consent";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireConsentSession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    verifyAuthority(getDb(), consentActor(ctx), String(form.get("authorityId") ?? ""), String(form.get("evidenceRef") ?? ""));
    return redirectTo(request, `/consent/${id}`, { notice: "verified" });
  } catch (error) {
    return consentFailure(request, error, `/consent/${id}`);
  }
}
