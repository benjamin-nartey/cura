import { decideDuplicate, getDb } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const { id } = await context.params;
  const form = await request.formData();
  const decision = String(form.get("decision") ?? "");
  if (decision !== "different" && decision !== "needs-information" && decision !== "merge") {
    return redirectTo(request, `/patients/duplicates/${id}`, { error: "invalid" });
  }
  if (decision === "merge" && String(form.get("confirm") ?? "") !== "yes") {
    return redirectTo(request, `/patients/duplicates/${id}`, { error: "invalid" });
  }
  try {
    const result = decideDuplicate(
      getDb(),
      masterActor(ctx),
      id,
      Number(form.get("expectedVersion") ?? 0),
      decision,
      formId(form.get("survivorId")),
      formId(form.get("commandKey")) || `merge-${id}`,
    );
    const notice = "status" in result && result.status === "merged" ? "merged" : "reviewed";
    return redirectTo(request, `/patients/duplicates/${id}`, { notice });
  } catch (error) {
    return redirectTo(request, `/patients/duplicates/${id}`, { error: failureCode(error) });
  }
}
