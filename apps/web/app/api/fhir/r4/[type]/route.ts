import { createFhirObservation, createFhirSubscription, getDb, prepareFhirObservation, searchFhir } from "@curasphere/domain";
import { recordFoundationObservation } from "@/lib/foundation";
import { fhirFailure, fhirResponse, idempotencyKey } from "@/lib/fhir-response";
import { currentSession } from "@/lib/http";

function fhirFoundation(status: "invalid" | "forbidden" | "duplicate" | "notfound" | "code" | "range" | "unavailable") {
  const diagnostics =
    status === "unavailable"
      ? "The foundation service is not running."
      : status === "forbidden"
        ? "You cannot change this chart with this role."
        : status === "notfound"
          ? "That record is not on this facility."
          : status === "duplicate"
            ? "That submission key was already used for a different entry."
            : status === "code"
              ? "That observation is not in this facility catalog."
              : status === "range"
                ? "That result is outside the accepted entry range."
                : "The observation was not stored.";
  const http = status === "unavailable" ? 503 : status === "forbidden" ? 403 : status === "notfound" ? 404 : status === "duplicate" ? 409 : 400;
  return fhirResponse({ resourceType: "OperationOutcome", issue: [{ severity: "error", code: status, diagnostics }] }, http);
}

function signInRequired() {
  return fhirResponse(
    { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "login", diagnostics: "Sign in required." }] },
    401,
  );
}

export async function GET(request: Request, context: { params: Promise<{ type: string }> }) {
  const ctx = await currentSession();
  if (!ctx) return signInRequired();
  const { type } = await context.params;
  const url = new URL(request.url);
  try {
    const bundle = searchFhir(getDb(), ctx, type, {
      name: url.searchParams.get("name") ?? undefined,
      patient: url.searchParams.get("patient") ?? undefined,
    });
    return fhirResponse(bundle);
  } catch (error) {
    return fhirFailure(error);
  }
}

export async function POST(request: Request, context: { params: Promise<{ type: string }> }) {
  const ctx = await currentSession();
  if (!ctx) return signInRequired();
  const { type } = await context.params;
  try {
    const body = await request.json();
    const key = idempotencyKey(request);
    if (type === "Observation") {
      const draft = prepareFhirObservation(getDb(), ctx, body, key);
      const recorded = await recordFoundationObservation(ctx.sessionId, draft.patientId, {
        code: draft.code,
        value: draft.value,
        idempotencyKey: key,
      });
      if (recorded.status !== "ok") return fhirFoundation(recorded.status);
      return fhirResponse(createFhirObservation(getDb(), ctx, body, key, recorded.observation.id), 201);
    }
    if (type === "Subscription") return fhirResponse(createFhirSubscription(getDb(), ctx, body, key), 201);
    return fhirResponse(
      {
        resourceType: "OperationOutcome",
        issue: [{ severity: "error", code: "invalid", diagnostics: "That resource type cannot be created." }],
      },
      400,
    );
  } catch (error) {
    if (error instanceof SyntaxError) {
      return fhirResponse(
        { resourceType: "OperationOutcome", issue: [{ severity: "error", code: "invalid", diagnostics: "The body must be JSON." }] },
        400,
      );
    }
    return fhirFailure(error);
  }
}
