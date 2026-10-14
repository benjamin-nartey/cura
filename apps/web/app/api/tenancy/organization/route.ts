import { getDb, mirrorTenancySession, readTenantOrganization, seedDemoTenants } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const organizationId = formId(form.get("organizationId"));
  const db = getDb();
  seedDemoTenants(db);
  try {
    mirrorTenancySession(db, ctx.sessionId, ctx.userId);
    readTenantOrganization(db, ctx.sessionId, organizationId);
    return redirectTo(request, "/tenancy", { notice: "listed" });
  } catch (error) {
    return redirectTo(request, "/tenancy", { error: failureCode(error) });
  }
}
