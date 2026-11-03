import { createPrivacyRequest, getDb } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await requirePrivacySession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    const created = createPrivacyRequest(getDb(), privacyActor(ctx), {
      requestType: String(form.get("requestType") ?? ""),
      subjectId: String(form.get("subjectId") ?? ""),
      relationship: String(form.get("relationship") ?? ""),
      authorityId: String(form.get("authorityId") ?? "") || null,
      jurisdiction: String(form.get("jurisdiction") ?? ""),
      categories: String(form.get("categories") ?? "").split(",").filter(Boolean),
      idempotencyKey: String(form.get("idempotencyKey") ?? ""),
      correctionField: String(form.get("correctionField") ?? "") || null,
      correctionValue: String(form.get("correctionValue") ?? "") || null,
      clientSubjectId: String(form.get("clientSubjectId") ?? "") || null,
    });
    return redirectTo(request, `/privacy/requests/${created.id}`, { notice: "submitted" });
  } catch (error) {
    return privacyFailure(request, error, "/privacy/requests/new");
  }
}
