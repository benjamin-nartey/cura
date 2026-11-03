import { getDb, linkPractitioner } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const { id } = await context.params;
  const form = await request.formData();
  try {
    linkPractitioner(getDb(), masterActor(ctx), id, formId(form.get("userId")));
    return redirectTo(request, `/practitioners/${id}`, { notice: "linked" });
  } catch (error) {
    return redirectTo(request, `/practitioners/${id}`, { error: failureCode(error) });
  }
}
