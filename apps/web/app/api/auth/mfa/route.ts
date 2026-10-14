import { cookies } from "next/headers";
import { AppError } from "@curasphere/domain";
import { redirectTo, withSession } from "@/lib/http";
import { finishMfa } from "@/lib/workforce-auth";

export async function POST(request: Request) {
  const jar = await cookies();
  const pendingId = jar.get("cura_mfa")?.value ?? "";
  const form = await request.formData();
  const code = String(form.get("code") ?? "").trim();
  try {
    const result = await finishMfa(pendingId, code);
    if (result.status !== "session") return redirectTo(request, "/auth/mfa", { error: "idp" });
    const response = withSession(redirectTo(request, "/dashboard"), result.sessionId);
    response.cookies.set("cura_mfa", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
    return response;
  } catch (error) {
    const codeName = error instanceof AppError ? error.code : "mfa";
    return redirectTo(request, "/auth/mfa", { error: codeName === "closed" ? "closed" : "mfa" });
  }
}
