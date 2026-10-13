import { closePatientSession, getDb } from "@curasphere/domain";
import { bearer, json } from "@/lib/patient-app";

export async function POST(request: Request) {
  const sid = bearer(request);
  if (sid) closePatientSession(getDb(), sid);
  return json({ ok: true });
}
