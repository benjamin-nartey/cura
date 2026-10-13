import { getDb, readPortal } from "@curasphere/domain";
import { failed, json, patientFrom, refused } from "@/lib/patient-app";

export async function GET(request: Request) {
  const ctx = patientFrom(request);
  if (!ctx) return refused("signin");
  try {
    return json({ facilityName: ctx.facilityName, displayName: ctx.displayName, record: readPortal(getDb(), ctx) });
  } catch (error) {
    return failed(error);
  }
}
