import { askPatient, getDb } from "@curasphere/domain";
import { bodyOf, failed, json, key, patientFrom, refused, text } from "@/lib/patient-app";

export async function POST(request: Request) {
  const ctx = patientFrom(request);
  if (!ctx) return refused("signin");
  const body = await bodyOf(request);
  try {
    return json(askPatient(getDb(), ctx, { text: text(body.text), idempotencyKey: key(body.idempotencyKey) }), 201);
  } catch (error) {
    return failed(error);
  }
}
