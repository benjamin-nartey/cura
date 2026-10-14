import { getDb, mirrorTenancySession, seedDemoTenants, switchFacility } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const facilityId = formId(form.get("facilityId"));
  const version = Number(form.get("version"));
  const db = getDb();
  seedDemoTenants(db);
  try {
    mirrorTenancySession(db, ctx.sessionId, ctx.userId);
    switchFacility(db, ctx.sessionId, facilityId, Number.isInteger(version) ? version : -1);
    return redirectTo(request, "/tenancy", { notice: "switched" });
  } catch (error) {
    return redirectTo(request, "/tenancy", { error: failureCode(error) });
  }
}
