import { cleanupExpiredExports, getDb } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await requirePrivacySession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  try {
    const result = cleanupExpiredExports(getDb(), privacyActor(ctx));
    return redirectTo(request, "/privacy/exports/monitor", { notice: "cleaned", count: String(result.cleaned) });
  } catch (error) {
    return privacyFailure(request, error, "/privacy/exports/monitor");
  }
}
