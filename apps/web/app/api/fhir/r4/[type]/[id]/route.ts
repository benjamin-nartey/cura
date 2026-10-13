import { getDb, readFhirResource } from "@curasphere/domain";
import { fhirFailure, fhirResponse } from "@/lib/fhir-response";
import { currentSession } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  const ctx = await currentSession();
  if (!ctx) {
    return fhirResponse(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "login", diagnostics: "Sign in required." }] },
      401,
    );
  }
  const { type, id } = await context.params;
  try {
    const resource = readFhirResource(getDb(), ctx, type, id);
    if (!resource) {
      return fhirResponse(
        {
          resourceType: "OperationOutcome",
          issue: [{ severity: "error", code: "not-found", diagnostics: "That record is not on this facility." }],
        },
        404,
      );
    }
    return fhirResponse(resource);
  } catch (error) {
    return fhirFailure(error);
  }
}
