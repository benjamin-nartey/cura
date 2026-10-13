import { NextResponse } from "next/server";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@curasphere/domain";

export function fhirResponse(body: unknown, status = 200, headers?: Record<string, string>) {
  return new NextResponse(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/fhir+json; charset=utf-8",
      "cache-control": "no-store",
      ...headers,
    },
  });
}

function outcome(status: number, code: string, diagnostics: string) {
  return fhirResponse(
    { resourceType: "OperationOutcome", issue: [{ severity: "error", code, diagnostics }] },
    status,
  );
}

export function fhirFailure(error: unknown) {
  if (error instanceof ForbiddenError) return outcome(403, "forbidden", error.message);
  if (error instanceof NotFoundError) return outcome(404, "not-found", error.message);
  if (error instanceof ConflictError) return outcome(409, "conflict", error.message);
  if (error instanceof ValidationError || error instanceof AppError) return outcome(400, "invalid", error.message);
  console.error("fhir_failure");
  return outcome(500, "exception", "The request could not be completed.");
}

export function idempotencyKey(request: Request) {
  return request.headers.get("idempotency-key") ?? "";
}

export function ndjson(body: string) {
  return new NextResponse(body, {
    status: 200,
    headers: {
      "content-type": "application/fhir+ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
