import { beginWorkforceLogin } from "@/lib/workforce-auth";
import { redirectTo } from "@/lib/http";

// The callback host is localhost so the browser can use it as a passkey relying party.
export async function GET(request: Request) {
  try {
    const started = await beginWorkforceLogin();
    const response = redirectTo(request, started.url);
    response.cookies.set("cura_auth", started.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.CURASPHERE_ENV === "production",
      path: "/",
      maxAge: 600,
    });
    return response;
  } catch {
    return redirectTo(request, "/", { error: "idp" });
  }
}
