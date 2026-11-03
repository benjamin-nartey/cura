import { getDb, queueExport, runExport } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await requirePrivacySession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  const requestId = String(form.get("requestId") ?? "");
  try {
    const queued = queueExport(getDb(), privacyActor(ctx), requestId, String(form.get("idempotencyKey") ?? ""), String(form.get("clientSubjectId") ?? "") || null);
    const ran = runExport(getDb(), privacyActor(ctx), queued.id);
    if (ran.status === "blocked") return redirectTo(request, `/privacy/exports/${queued.id}`, { error: "conflict" });
    return redirectTo(request, `/privacy/exports/${queued.id}`, { notice: "ready" });
  } catch (error) {
    return privacyFailure(request, error, `/privacy/requests/${requestId}`);
  }
}
