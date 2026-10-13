import { getDb, requestAppointment } from "@curasphere/domain";
import { bodyOf, failed, json, key, patientFrom, refused, text } from "@/lib/patient-app";

export async function POST(request: Request) {
  const ctx = patientFrom(request);
  if (!ctx) return refused("signin");
  const body = await bodyOf(request);
  try {
    return json(requestAppointment(getDb(), ctx, { reason: text(body.reason), idempotencyKey: key(body.idempotencyKey) }), 201);
  } catch (error) {
    return failed(error);
  }
}
