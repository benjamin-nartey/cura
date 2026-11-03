import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from "@curasphere/domain";
import { failureCode } from "@/lib/http";

export function sourceError(error: unknown) {
  if (error instanceof ConflictError) {
    if (error.message.includes("closed")) return "source-closed";
    if (error.message.includes("changed")) return "source-stale";
    return "source";
  }
  if (error instanceof ValidationError || error instanceof ForbiddenError || error instanceof NotFoundError) return error.code;
  return failureCode(error);
}

export function sourceKey(parts: string[]) {
  const key = `src-${parts.join("-")}`.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 80);
  return key.length >= 8 ? key : `${key}source`;
}
