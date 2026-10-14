import { AppError, confirmTotp } from "@curasphere/domain";
import { currentSession, redirectTo } from "@/lib/http";
import { prepareIdentityDatabase } from "@/lib/workforce-auth";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const code = String(form.get("code") ?? "");
  const db = await prepareIdentityDatabase();
  try {
    confirmTotp(db, ctx.userId, code);
  } catch (error) {
    const shown = error instanceof AppError && error.code === "closed" ? "closed" : "mfa";
    return redirectTo(request, "/auth/enroll", { error: shown });
  }
  const response = redirectTo(request, "/auth/enroll", { notice: "enrolled" });
  const clear = { httpOnly: true, sameSite: "lax" as const, path: "/auth/enroll", maxAge: 0 };
  response.cookies.set("cura_totp_setup", "", clear);
  response.cookies.set("cura_totp_recovery", "", clear);
  return response;
}
