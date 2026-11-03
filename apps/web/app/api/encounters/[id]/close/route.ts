import { closeVisitEncounter, getDb } from "@curasphere/domain";
import { currentSession, redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { scheduleError } from "@/lib/schedule";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/?error=expired");
  const { id } = await context.params;
  const form = await request.formData();
  try {
    closeVisitEncounter(getDb(), masterActor(ctx), id, Number(form.get("version")), "visit-complete");
    return redirectTo(request, `/encounters/${id}`, { notice: "closed" });
  } catch (error) {
    return redirectTo(request, `/encounters/${id}/close`, { error: scheduleError(error) });
  }
}
