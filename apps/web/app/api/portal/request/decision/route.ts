import { decideAppointmentRequest, getDb, readPendingPatientRequest } from "@curasphere/domain";
import { bookFoundationAppointment } from "@/lib/foundation";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

function utcInstant(value: string) {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString();
}

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const patientId = formId(form.get("patientId"));
  const back = patientId ? `/patients/${patientId}` : "/patients";
  const decision = form.get("decision") === "declined" ? "declined" : "accepted";
  const requestId = formId(form.get("requestId"));
  const idempotencyKey = formId(form.get("idempotencyKey"));
  let startsAt = String(form.get("startsAt") ?? "");
  let endsAt = String(form.get("endsAt") ?? "");
  let appointmentId: string | undefined;
  try {
    if (decision === "accepted") {
      const start = utcInstant(startsAt);
      const end = utcInstant(endsAt);
      if (start && end && Date.parse(end) > Date.parse(start)) {
        const pending = readPendingPatientRequest(getDb(), ctx, requestId);
        const booked = await bookFoundationAppointment(ctx.sessionId, {
          patientId: pending.patientId,
          reason: pending.reason,
          startsAt: start,
          endsAt: end,
          idempotencyKey,
        });
        if (booked.status !== "ok") {
          return redirectTo(request, back, { error: booked.status === "unavailable" ? "foundation" : booked.status });
        }
        appointmentId = booked.appointment.id;
        startsAt = start;
        endsAt = end;
      }
    }
    decideAppointmentRequest(getDb(), ctx, {
      requestId,
      decision,
      startsAt,
      endsAt,
      appointmentId,
      idempotencyKey,
    });
    return redirectTo(request, back, { notice: decision === "accepted" ? "booked" : "requestdeclined" });
  } catch (error) {
    return redirectTo(request, back, { error: failureCode(error) });
  }
}
