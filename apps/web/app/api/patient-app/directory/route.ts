import { getDb, listPatientDirectory } from "@curasphere/domain";
import { failed, json } from "@/lib/patient-app";

export async function GET() {
  try {
    return json(listPatientDirectory(getDb()));
  } catch (error) {
    return failed(error);
  }
}
