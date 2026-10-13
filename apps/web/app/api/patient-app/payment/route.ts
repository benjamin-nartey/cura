import { getDb, recordPatientPayment } from "@curasphere/domain";
import { bodyOf, failed, json, key, patientFrom, refused, text } from "@/lib/patient-app";

function cents(value: unknown) {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return Number(value.trim());
  return Number.NaN;
}

export async function POST(request: Request) {
  const ctx = patientFrom(request);
  if (!ctx) return refused("signin");
  const body = await bodyOf(request);
  try {
    return json(
      recordPatientPayment(getDb(), ctx, { description: text(body.description), amountCents: cents(body.amountCents), idempotencyKey: key(body.idempotencyKey) }),
      201,
    );
  } catch (error) {
    return failed(error);
  }
}
