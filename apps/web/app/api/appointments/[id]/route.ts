import { arriveAppointment, cancelAppointment, confirmAppointment, getDb, noShowAppointment, startVisitEncounter } from "@curasphere/domain";
import { currentSession, redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { commandKey, scheduleError } from "@/lib/schedule";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/?error=expired");
  const { id } = await context.params;
  const form = await request.formData();
  const version = Number(form.get("version"));
  const action = String(form.get("action") ?? "");
  const actor = masterActor(ctx);
  const back = form.get("return") === "check-in" ? "/appointments/check-in" : `/appointments/${id}`;
  try {
    if (action === "confirm") {
      confirmAppointment(getDb(), actor, id, version);
      return redirectTo(request, `/appointments/${id}`, { notice: "confirmed" });
    }
    if (action === "arrive") {
      arriveAppointment(getDb(), actor, id, version);
      return redirectTo(request, back, { notice: "arrived" });
    }
    if (action === "cancel") {
      cancelAppointment(getDb(), actor, id, version, String(form.get("reason") ?? ""));
      return redirectTo(request, `/appointments/${id}`, { notice: "cancelled" });
    }
    if (action === "no-show") {
      noShowAppointment(getDb(), actor, id, version, "window-passed");
      return redirectTo(request, `/appointments/${id}`, { notice: "noshow" });
    }
    if (action === "start") {
      const encounter = startVisitEncounter(getDb(), actor, id, version, commandKey("start", [id]));
      return redirectTo(request, `/encounters/${encounter.id}`, { notice: "started" });
    }
    return redirectTo(request, `/appointments/${id}`, { error: "invalid" });
  } catch (error) {
    return redirectTo(request, back, { error: scheduleError(error) });
  }
}
