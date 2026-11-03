import { assignEmergencyReview, getDb } from "@curasphere/domain";
import { failureCode, formId, redirectTo } from "@/lib/http";
import { denied, emergencyCaller, sameOrigin } from "@/lib/emergency-http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return denied();
  const caller = await emergencyCaller();
  if (!caller) return redirectTo(request, "/");
  const { id } = await context.params;
  const form = await request.formData();
  try {
    assignEmergencyReview(getDb(), caller.actor, id, formId(form.get("reviewerId")) || caller.actor.userId);
    return redirectTo(request, `/emergency/reviews/${id}`);
  } catch (error) {
    return redirectTo(request, `/emergency/reviews/${id}`, { error: failureCode(error) });
  }
}
