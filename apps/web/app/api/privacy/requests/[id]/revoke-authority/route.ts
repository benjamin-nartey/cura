import { effectivePermissions, ForbiddenError, getDb, revokePrivacyAuthority } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requirePrivacySession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
    if (!access.permissions.includes("privacy.request.approve")) throw new ForbiddenError();
    const authorityId = String(form.get("authorityId") ?? "");
    if (!authorityId) throw new ForbiddenError();
    revokePrivacyAuthority(getDb(), authorityId);
    return redirectTo(request, `/privacy/requests/${id}`, { notice: "authority-revoked" });
  } catch (error) {
    return privacyFailure(request, error, `/privacy/requests/${id}`);
  }
}
