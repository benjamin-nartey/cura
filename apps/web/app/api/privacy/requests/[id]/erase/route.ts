import { executeErasure, getDb, planErasure } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requirePrivacySession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  try {
    const plan = planErasure(getDb(), privacyActor(ctx), id);
    const result = executeErasure(getDb(), privacyActor(ctx), id, plan.id);
    return redirectTo(request, `/privacy/requests/${id}`, { notice: result.outcome === "partial" ? "erasure-partial" : "erasure-fulfilled" });
  } catch (error) {
    return privacyFailure(request, error, `/privacy/requests/${id}`);
  }
}
