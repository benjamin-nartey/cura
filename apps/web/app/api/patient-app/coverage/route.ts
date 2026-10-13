import { getDb, storeCoverage } from "@curasphere/domain";
import { bodyOf, failed, json, key, patientFrom, refused, text } from "@/lib/patient-app";

export async function POST(request: Request) {
  const ctx = patientFrom(request);
  if (!ctx) return refused("signin");
  const body = await bodyOf(request);
  try {
    return json(storeCoverage(getDb(), ctx, { payerName: text(body.payerName), memberId: text(body.memberId), idempotencyKey: key(body.idempotencyKey) }), 201);
  } catch (error) {
    return failed(error);
  }
}
