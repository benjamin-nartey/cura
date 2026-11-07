import { commitRegistration, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const draftId = formId(form.get("draftId"));
  try {
    const created = commitRegistration(getDb(), masterActor(ctx), draftId);
    return redirectTo(request, `/patients/${created.id}/identity`, { notice: "registered" });
  } catch (error) {
    return redirectTo(request, "/patients/review", { draft: draftId, error: failureCode(error) });
  }
}
