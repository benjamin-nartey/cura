import { getDb, verifyPrivacyRequest } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requirePrivacySession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    verifyPrivacyRequest(getDb(), privacyActor(ctx), id, {
      method: String(form.get("method") ?? ""),
      authorityId: String(form.get("authorityId") ?? "") || null,
      email: String(form.get("email") ?? "") || null,
      expectedVersion: Number(form.get("expectedVersion") ?? "0"),
    });
    return redirectTo(request, `/privacy/requests/${id}`, { notice: "verified" });
  } catch (error) {
    return privacyFailure(request, error, `/privacy/requests/${id}`);
  }
}
