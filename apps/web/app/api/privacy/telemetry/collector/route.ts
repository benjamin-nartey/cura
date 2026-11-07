import { getDb, setCollectorHealth } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await requirePrivacySession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  const collector = form.get("collector") === "disconnected" ? "disconnected" : "ready";
  try {
    setCollectorHealth(getDb(), privacyActor(ctx), collector, collector === "disconnected" ? "collector-unavailable" : null);
    return redirectTo(request, "/privacy/telemetry/health", { notice: collector === "disconnected" ? "collector-disconnected" : "collector-ready" });
  } catch (error) {
    return privacyFailure(request, error, "/privacy/telemetry/health");
  }
}
