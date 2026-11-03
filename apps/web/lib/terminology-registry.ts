import { AppError, getDb, readBoundSession, type ReleaseInput } from "@curasphere/domain";
import { optionalSession } from "@/lib/session";
import { NextResponse } from "next/server";
export const terminologyJson = (data: unknown, status = 200) => NextResponse.json(data, { status, headers: { "cache-control": "no-store" } });
export async function terminologyCaller() {
  const ctx = await optionalSession();
  if (!ctx || readBoundSession(getDb(), ctx.sessionId)?.active === false) return null;
  return ctx;
}
export function terminologyFailure(error: unknown) {
  if (error instanceof AppError) return terminologyJson({ error: error.code, message: error.message }, error.code === "forbidden" || error.code === "license" ? 403 : error.code === "notfound" ? 404 : ["conflict","duplicate"].includes(error.code) ? 409 : error.code === "unavailable" ? 503 : 422);
  console.error("terminology_registry_failure");
  return terminologyJson({ error: "unavailable", message: "The terminology registry is unavailable. Retry without changing the submission key." }, 503);
}
export function terminologySameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try { return new URL(origin).host === request.headers.get("host"); } catch { return false; }
}
export async function releaseBody(request: Request): Promise<ReleaseInput> {
  return await terminologyBody(request,["systemUri","name","version","edition","activeFrom","activeTo","rights","sourceUrl","sourceNote","concepts","idempotencyKey"]) as ReleaseInput;
}
export async function terminologyBody(request: Request, fields: string[]): Promise<unknown> {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new AppError("invalid","Use a JSON release manifest.");
  const raw = await request.text();
  if (raw.length > 50000) throw new AppError("invalid","The release manifest is too large.");
  let value;
  try { value = JSON.parse(raw); } catch { throw new AppError("invalid","The release manifest is not valid JSON."); }
  const keys = new Set(fields);
  if (!value || typeof value !== "object" || Array.isArray(value) || Object.keys(value).some(key => !keys.has(key))) throw new AppError("invalid","The release manifest contains unsupported fields.");
  return value;
}
