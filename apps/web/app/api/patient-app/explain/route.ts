import { explainPortal, getDb } from "@curasphere/domain";
import { bodyOf, failed, json, key, patientFrom, refused } from "@/lib/patient-app";

export async function POST(request: Request) {
  const ctx = patientFrom(request);
  if (!ctx) return refused("signin");
  const body = await bodyOf(request);
  try {
    const explained = explainPortal(getDb(), ctx, { idempotencyKey: key(body.idempotencyKey) });
    return json({ aiOutcome: explained.aiOutcome, aiText: explained.aiText, count: explained.results.length }, 201);
  } catch (error) {
    return failed(error);
  }
}
