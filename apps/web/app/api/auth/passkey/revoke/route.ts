import { revokePasskey } from "@curasphere/domain";
import { currentSession, redirectTo } from "@/lib/http";
import { prepareIdentityDatabase } from "@/lib/workforce-auth";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const credentialId = String(form.get("credentialId") ?? "");
  if (!/^[A-Za-z0-9_-]{16,512}$/.test(credentialId)) return redirectTo(request, "/auth/enroll", { error: "invalid" });
  const db = await prepareIdentityDatabase();
  try {
    revokePasskey(db, ctx.userId, credentialId);
  } catch {
    return redirectTo(request, "/auth/enroll", { error: "invalid" });
  }
  return redirectTo(request, "/auth/enroll", { notice: "revoked" });
}
