import { createPractitioner, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    const created = createPractitioner(getDb(), masterActor(ctx), {
      displayName: String(form.get("displayName") ?? ""),
      roleType: String(form.get("roleType") ?? ""),
      licenseNumber: String(form.get("licenseNumber") ?? ""),
      licenseIssuer: String(form.get("licenseIssuer") ?? ""),
      facilityId: formId(form.get("facilityId")),
    });
    return redirectTo(request, `/practitioners/${created.id}`, { notice: "practitioner" });
  } catch (error) {
    return redirectTo(request, "/practitioners", { error: failureCode(error) });
  }
}
