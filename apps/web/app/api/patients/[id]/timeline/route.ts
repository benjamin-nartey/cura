import { NextResponse } from "next/server";
import { AppError, ConflictError, ForbiddenError, NotFoundError, ValidationError, getDb, readPatientTimeline } from "@curasphere/domain";
import { readFoundationTimeline } from "@/lib/foundation";
import { currentSession } from "@/lib/http";

function body(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "cache-control": "no-store" } });
}

function failure(error: unknown) {
  if (error instanceof ForbiddenError) return body({ error: error.message }, 403);
  if (error instanceof NotFoundError) return body({ error: error.message }, 404);
  if (error instanceof ConflictError || error instanceof ValidationError || error instanceof AppError) {
    return body({ error: error.message }, error instanceof ConflictError ? 409 : 400);
  }
  console.error("timeline_read_failed");
  return body({ error: "The request could not be completed." }, 500);
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await currentSession();
  if (!ctx) return body({ error: "Sign in required." }, 401);
  const { id } = await context.params;
  const group = new URL(request.url).searchParams.get("group") ?? "all";
  try {
    const foundation = await readFoundationTimeline(ctx.sessionId, id, group);
    if (foundation) return body(foundation);
    const timeline = readPatientTimeline(getDb(), ctx, id, group);
    if (!timeline) return body({ error: "That record is not on this facility." }, 404);
    return body(timeline);
  } catch (error) {
    return failure(error);
  }
}
