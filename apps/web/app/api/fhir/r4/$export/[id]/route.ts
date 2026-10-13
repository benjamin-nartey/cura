import { getDb, readFhirExport } from "@curasphere/domain";
import { fhirFailure, fhirResponse, ndjson } from "@/lib/fhir-response";
import { currentSession } from "@/lib/http";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await currentSession();
  if (!ctx) {
    return fhirResponse(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "login", diagnostics: "Sign in required." }] },
      401,
    );
  }
  const { id } = await context.params;
  try {
    const exported = readFhirExport(getDb(), ctx, id);
    return ndjson(exported.ndjson);
  } catch (error) {
    return fhirFailure(error);
  }
}
