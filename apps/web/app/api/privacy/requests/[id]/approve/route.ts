import { approvePrivacyRequest, getDb } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requirePrivacySession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    const result = approvePrivacyRequest(getDb(), privacyActor(ctx), id, Number(form.get("expectedVersion") ?? "0"), form.get("mode") === "partial" ? "partial" : "full");
    const notice = result.status === "elevated_review" ? "elevated" : result.status === "partially_approved" ? "partial" : "approved";
    return redirectTo(request, `/privacy/requests/${id}`, { notice });
  } catch (error) {
    return privacyFailure(request, error, `/privacy/requests/${id}`);
  }
}
