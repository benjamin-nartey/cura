import { getDb, openPatientSession, readPatientSession } from "@curasphere/domain";
import { bodyOf, failed, json, refused, text } from "@/lib/patient-app";

export async function POST(request: Request) {
  const body = await bodyOf(request);
  const principalId = text(body.principalId);
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(principalId)) return refused("signin");
  try {
    const opened = openPatientSession(getDb(), principalId);
    const ctx = readPatientSession(getDb(), opened.sessionId);
    if (!ctx) return refused("signin");
    return json({ sessionId: opened.sessionId, displayName: ctx.displayName, facilityName: ctx.facilityName, expiresAt: opened.expiresAt });
  } catch (error) {
    return failed(error);
  }
}
