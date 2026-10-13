import { openFoundationSession, readFoundationSession } from "@/lib/foundation";
import { formId, redirectTo, withSession } from "@/lib/http";

export async function POST(request: Request) {
  const form = await request.formData();
  const userId = formId(form.get("userId"));
  const foundation = await openFoundationSession(userId);
  if (foundation.status === "disabled") return redirectTo(request, "/", { error: "disabled" });
  if (foundation.status !== "ok") return redirectTo(request, "/", { error: "foundation" });
  const ctx = await readFoundationSession(foundation.sessionId);
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const dest = "/dashboard";
  return withSession(redirectTo(request, dest), foundation.sessionId);
}
