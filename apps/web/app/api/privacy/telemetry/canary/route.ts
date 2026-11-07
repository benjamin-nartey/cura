import { getDb, runCanary } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await requirePrivacySession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  const scenarioId = String(form.get("scenarioId") ?? "");
  try {
    const result = runCanary(getDb(), privacyActor(ctx), scenarioId);
    return redirectTo(request, "/privacy/telemetry/canary", { notice: result.passed ? "pass" : "fail", scenario: scenarioId });
  } catch (error) {
    return privacyFailure(request, error, "/privacy/telemetry/canary");
  }
}
