import { AppError, getDb, openPatientSession, readPatientSession } from "@curasphere/domain";
import { formId, redirectTo, withPortal } from "@/lib/http";

export async function POST(request: Request) {
  const form = await request.formData();
  const principalId = formId(form.get("principalId"));
  try {
    const opened = openPatientSession(getDb(), principalId);
    const ctx = readPatientSession(getDb(), opened.sessionId);
    if (!ctx) return redirectTo(request, "/portal", { error: "signin" });
    return withPortal(redirectTo(request, "/portal/home"), opened.sessionId);
  } catch (error) {
    const code = error instanceof AppError && error.code === "disabled" ? "disabled" : "signin";
    return redirectTo(request, "/portal", { error: code });
  }
}
