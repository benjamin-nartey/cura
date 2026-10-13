import { getDb, releaseImagingStudy } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    releaseImagingStudy(getDb(), ctx, {
      studyId: String(form.get("studyId") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/imaging", { notice: "imgrelease" });
  } catch (error) {
    return redirectTo(request, "/imaging", { error: failureCode(error) });
  }
}
