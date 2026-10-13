import { decideDocumentationDraft, editDocumentationSection, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const sectionId = formId(form.get("sectionId"));
  const decision = form.get("decision") === "rejected" ? "rejected" : form.get("decision") === "accepted" ? "accepted" : "";
  try {
    if (sectionId) {
      editDocumentationSection(getDb(), ctx, {
        sectionId,
        text: String(form.get("text") ?? ""),
        idempotencyKey: formId(form.get("idempotencyKey")),
      });
      return redirectTo(request, back, { notice: "edited" });
    }
    if (decision !== "accepted" && decision !== "rejected") return redirectTo(request, back, { error: "invalid" });
    decideDocumentationDraft(getDb(), ctx, {
      draftId: formId(form.get("draftId")),
      decision,
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, back, { notice: decision });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
