import { getDb, listSlots, nextOpenSlot, requestScheduledAppointment } from "@curasphere/domain";
import { currentSession, formId, redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { commandKey, scheduleError } from "@/lib/schedule";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/?error=expired");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const practitionerId = formId(form.get("practitionerId"));
  const category = form.get("category") === "new-visit" ? "new-visit" : "follow-up";
  const date = String(form.get("date") ?? "");
  const startsAt = String(form.get("startsAt") ?? "");
  const actor = masterActor(ctx);
  try {
    const slots = listSlots(getDb(), actor, practitionerId, date, category);
    const slot = slots.find((item) => item.startsAt === startsAt);
    if (!slot) {
      const offered = nextOpenSlot(getDb(), actor, practitionerId, date, category, startsAt)?.startsAt ?? "";
      return redirectTo(request, "/appointments/new", { error: "slot", patient: patientId, practitioner: practitionerId, category, date, offered });
    }
    const created = requestScheduledAppointment(getDb(), actor, {
      patientId,
      practitionerId,
      category,
      startsAt: slot.startsAt,
      endsAt: slot.endsAt,
      resourceId: slot.resourceId,
      idempotencyKey: commandKey("book", [patientId, practitionerId, startsAt]),
    });
    return redirectTo(request, `/appointments/${created.id}`, { notice: "scheduled" });
  } catch (error) {
    const code = scheduleError(error);
    let offered = "";
    if (code === "slot") {
      try {
        offered = nextOpenSlot(getDb(), actor, practitionerId, date, category, startsAt)?.startsAt ?? "";
      } catch {
        offered = "";
      }
    }
    return redirectTo(request, "/appointments/new", { error: code, patient: patientId, practitioner: practitionerId, category, date, offered });
  }
}
