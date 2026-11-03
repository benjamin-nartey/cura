import { dispatchConsentJob, getDb } from "@curasphere/domain";
import { consentActor, consentFailure, requireConsentSession } from "@/lib/consent";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await requireConsentSession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  const consentId = String(form.get("consentId") ?? "");
  try {
    const result = dispatchConsentJob(getDb(), consentActor(ctx), String(form.get("dispatchId") ?? ""));
    return redirectTo(request, `/consent/${consentId}`, { notice: result.status === "dispatched" ? "dispatched" : "blocked" });
  } catch (error) {
    return consentFailure(request, error, `/consent/${consentId}`);
  }
}
