import { applyCorrection, getDb } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requirePrivacySession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  try {
    applyCorrection(getDb(), privacyActor(ctx), id);
    return redirectTo(request, `/privacy/requests/${id}`, { notice: "corrected" });
  } catch (error) {
    return privacyFailure(request, error, `/privacy/requests/${id}`);
  }
}
