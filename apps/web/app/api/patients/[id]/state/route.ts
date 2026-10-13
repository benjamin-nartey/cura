import { NextResponse } from "next/server";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError, getDb, readPatientState } from "@curasphere/domain";
import { currentSession } from "@/lib/http";

function body(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } });
}

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await currentSession();
  if (!ctx) return body({ error: "Sign in required." }, 401);
  const { id } = await context.params;
  try {
    const state = readPatientState(getDb(), ctx, id);
    if (!state) return body({ error: "That record is not on this facility." }, 404);
    return body(state);
  } catch (error) {
    if (error instanceof ForbiddenError) return body({ error: error.message }, 403);
    if (error instanceof NotFoundError) return body({ error: error.message }, 404);
    if (error instanceof ConflictError) return body({ error: error.message }, 409);
    if (error instanceof ValidationError || error instanceof AppError) return body({ error: error.message }, 400);
    console.error("patient_state_read_failed");
    return body({ error: "The request could not be completed." }, 500);
  }
}
