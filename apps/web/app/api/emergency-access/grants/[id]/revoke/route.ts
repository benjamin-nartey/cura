import { getDb, revokeEmergencyGrant } from "@curasphere/domain";
import { redirectTo } from "@/lib/http";
import { denied, emergencyCaller, sameOrigin } from "@/lib/emergency-http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return denied();
  const caller = await emergencyCaller();
  if (!caller) return redirectTo(request, "/");
  const { id } = await context.params;
  try {
    revokeEmergencyGrant(getDb(), caller.actor, id);
  } catch {
    return redirectTo(request, "/emergency/ended", { reason: "ended" });
  }
  return redirectTo(request, "/emergency/ended", { reason: "revoked" });
}
