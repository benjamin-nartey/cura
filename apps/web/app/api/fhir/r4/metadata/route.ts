import { fhirCapability } from "@curasphere/domain";
import { fhirResponse } from "@/lib/fhir-response";

export async function GET() {
  return fhirResponse(fhirCapability());
}
