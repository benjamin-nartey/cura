import { r4Negotiation } from "@/lib/r4-negotiation";
import { getDb, listSubscriptionNotifications } from "@curasphere/domain";
import { fhirFailure, fhirResponse } from "@/lib/fhir-response";
import { currentSession } from "@/lib/http";

export async function GET(request: Request, context: { params: Promise<{ type: string; id: string }> }) {
  const negotiation=r4Negotiation(request,false);if(negotiation)return negotiation;
  const ctx = await currentSession();
  if (!ctx) {
    return fhirResponse(
      { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "login", diagnostics: "Sign in required." }] },
      401,
    );
  }
  const { type, id } = await context.params;
  if (type !== "Subscription") {
    return fhirResponse(
      {
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: "Events are published for Subscription only." }],
      },
      400,
    );
  }
  try {
    const notes = listSubscriptionNotifications(getDb(), ctx, id);
    return fhirResponse({
      resourceType: "Bundle",
      type: "searchset",
      total: notes.length,
      entry: notes.map((resource) => ({ resource })),
    });
  } catch (error) {
    return fhirFailure(error);
  }
}
