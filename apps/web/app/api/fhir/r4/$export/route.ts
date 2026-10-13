import { getDb, startFhirExport } from "@curasphere/domain";
import { fhirFailure, fhirResponse, idempotencyKey } from "@/lib/fhir-response";
import { currentSession } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) {
    return fhirResponse(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "login", diagnostics: "Sign in required." }] },
      401,
    );
  }
  try {
    const job = startFhirExport(getDb(), ctx, idempotencyKey(request));
    const location = new URL(`/api/fhir/r4/$export/${job.id}`, request.url).toString();
    return fhirResponse(
      {
        resourceType: "OperationOutcome",
        issue: [{ severity: "information", code: "informational", diagnostics: "Export is ready." }],
      },
      202,
      { "content-location": location },
    );
  } catch (error) {
    return fhirFailure(error);
  }
}
