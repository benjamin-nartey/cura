import { cookies } from "next/headers";
import { AppError } from "@curasphere/domain";
import { redirectTo, withSession } from "@/lib/http";
import { finishWorkforceLogin } from "@/lib/workforce-auth";

export async function GET(request: Request) {
  const jar = await cookies();
  const transactionId = jar.get("cura_auth")?.value ?? "";
  const callback = new URL(request.url);
  const providerError = callback.searchParams.get("error");
  if (providerError === "access_denied" || providerError === "login_required") return clearAuth(redirectTo(request, "/", { error: "cancelled" }));
  if (providerError) return clearAuth(redirectTo(request, "/", { error: "idp" }));
  try {
    const result = await finishWorkforceLogin(transactionId, callback);
    if (result.status === "pending") return clearAuth(redirectTo(request, "/", { error: "pending" }));
    if (result.status === "idp") return clearAuth(redirectTo(request, "/", { error: "idp" }));
    if (result.status === "mfa") {
      const response = clearAuth(redirectTo(request, "/auth/mfa"));
      response.cookies.set("cura_mfa", result.pendingId, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.CURASPHERE_ENV === "production",
        path: "/",
        maxAge: 300,
      });
      return response;
    }
    return clearAuth(withSession(redirectTo(request, "/dashboard"), result.sessionId));
  } catch (error) {
    const code = error instanceof AppError ? error.code : "invalid";
    const shown = code === "closed" || code === "tenant" || code === "expired" ? code : "invalid";
    return clearAuth(redirectTo(request, "/", { error: shown }));
  }
}

function clearAuth(response: ReturnType<typeof redirectTo>) {
  response.cookies.set("cura_auth", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
