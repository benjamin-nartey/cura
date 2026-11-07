import type { SessionContext } from "@curasphere/contracts";
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { redirectTo } from "@/lib/http";
import { currentSession } from "@/lib/http";

export function consentActor(ctx: SessionContext) {
  return {
    userId: ctx.userId,
    organizationId: ctx.organizationId,
    facilityId: ctx.facilityId,
    sessionId: ctx.sessionId,
  };
}

export async function requireConsentSession() {
  const ctx = await currentSession();
  if (!ctx) return null;
  return ctx;
}

export function consentFailure(request: Request, error: unknown, fallback: string) {
  if (error instanceof ValidationError) return redirectTo(request, fallback, { error: "invalid" });
  if (error instanceof ForbiddenError) return redirectTo(request, fallback, { error: "forbidden" });
  if (error instanceof NotFoundError) return redirectTo(request, fallback, { error: "missing" });
  if (error instanceof ConflictError) return redirectTo(request, fallback, { error: "conflict" });
  return NextResponse.json({ error: "Consent processing failed." }, { status: 500 });
}
