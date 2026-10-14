import { AppError, revokeTotp } from "@curasphere/domain";
import { currentSession, redirectTo } from "@/lib/http";
import { prepareIdentityDatabase } from "@/lib/workforce-auth";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const db = await prepareIdentityDatabase();
  try {
    revokeTotp(db, ctx.userId);
  } catch (error) {
    const shown = error instanceof AppError ? "mfa" : "invalid";
    return redirectTo(request, "/auth/enroll", { error: shown });
  }
  return redirectTo(request, "/auth/enroll", { notice: "revoked" });
}
