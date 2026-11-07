import { getDb, listSlots, readAppointment, rescheduleAppointment } from "@curasphere/domain";
import { currentSession, redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { scheduleError } from "@/lib/schedule";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/?error=expired");
  const { id } = await context.params;
  const form = await request.formData();
  const version = Number(form.get("version"));
  const date = String(form.get("date") ?? "");
  const startsAt = String(form.get("startsAt") ?? "");
  const actor = masterActor(ctx);
  try {
    const current = readAppointment(getDb(), actor, id);
    const slots = current.practitioner_id && current.category ? listSlots(getDb(), actor, current.practitioner_id, date, current.category) : [];
    const slot = slots.find((item) => item.startsAt === startsAt);
    if (!slot) return redirectTo(request, `/appointments/${id}/reschedule`, { error: "slot", date });
    rescheduleAppointment(getDb(), actor, id, version, { startsAt: slot.startsAt, endsAt: slot.endsAt });
    return redirectTo(request, `/appointments/${id}`, { notice: "rescheduled" });
  } catch (error) {
    return redirectTo(request, `/appointments/${id}/reschedule`, { error: scheduleError(error), date });
  }
}
