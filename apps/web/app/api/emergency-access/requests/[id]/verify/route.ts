import { activateEmergency, getDb, verifyEmergencyTotp } from "@curasphere/domain";
import { failureCode, redirectTo } from "@/lib/http";
import { denied, emergencyCaller, sameOrigin } from "@/lib/emergency-http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return denied();
  const caller = await emergencyCaller();
  if (!caller) return redirectTo(request, "/");
  const { id } = await context.params;
  const form = await request.formData();
  try {
    verifyEmergencyTotp(getDb(), caller.actor, id, String(form.get("code") ?? ""));
    activateEmergency(getDb(), caller.actor, id);
    return redirectTo(request, "/emergency/active");
  } catch (error) {
    return redirectTo(request, `/emergency/verify/${id}`, { error: failureCode(error) });
  }
}
