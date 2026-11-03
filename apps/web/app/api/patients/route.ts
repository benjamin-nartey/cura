import type { Sex } from "@curasphere/contracts";
import { randomUUID } from "node:crypto";
import { commitRegistration, getDb, openRegistrationDraft } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    const draft = openRegistrationDraft(getDb(), masterActor(ctx), {
      givenName: String(form.get("givenName") ?? ""),
      familyName: String(form.get("familyName") ?? ""),
      preferredName: String(form.get("preferredName") ?? ""),
      birthDate: String(form.get("birthDate") ?? ""),
      sex: String(form.get("sex") ?? "") as Sex,
      contact: String(form.get("contact") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")) || randomUUID(),
    });
    if (draft.matches.length > 0) return redirectTo(request, "/patients/review", { draft: draft.draftId });
    const created = commitRegistration(getDb(), masterActor(ctx), draft.draftId);
    return redirectTo(request, `/patients/${created.id}/identity`, { notice: "registered" });
  } catch (error) {
    return redirectTo(request, "/patients", { error: failureCode(error) });
  }
}
