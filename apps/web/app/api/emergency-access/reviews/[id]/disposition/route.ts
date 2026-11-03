import { disposeEmergencyReview, getDb } from "@curasphere/domain";
import { failureCode, redirectTo } from "@/lib/http";
import { denied, emergencyCaller, sameOrigin } from "@/lib/emergency-http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return denied();
  const caller = await emergencyCaller();
  if (!caller) return redirectTo(request, "/");
  const { id } = await context.params;
  const form = await request.formData();
  const disposition = form.get("disposition") === "closed_inappropriate" ? "closed_inappropriate" : "closed_appropriate";
  try {
    disposeEmergencyReview(getDb(), caller.actor, id, disposition, String(form.get("notes") ?? "").slice(0, 500));
    return redirectTo(request, `/emergency/reviews/${id}`);
  } catch (error) {
    return redirectTo(request, `/emergency/reviews/${id}`, { error: failureCode(error) });
  }
}
