import { NextResponse } from "next/server";
import { AppError, getDb, readPatientSession } from "@curasphere/domain";

const STATUS: Record<string, number> = {
  disabled: 403,
  forbidden: 403,
  notfound: 404,
  conflict: 409,
  duplicate: 409,
  open: 409,
  invalid: 400,
  range: 400,
  code: 400,
  signin: 401,
};

export function bearer(request: Request) {
  const header = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9-]{8,80})$/.exec(header.trim());
  return match ? match[1] : null;
}

export function patientFrom(request: Request) {
  const sid = bearer(request);
  return sid ? readPatientSession(getDb(), sid) : null;
}

export function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { "cache-control": "no-store" } });
}

export function refused(code: string) {
  return json({ error: code }, STATUS[code] ?? 400);
}

export function failed(error: unknown) {
  if (error instanceof AppError) return refused(error.code);
  console.error("patient_app_failure");
  return refused("invalid");
}

export async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  try {
    const parsed = await request.json();
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

export function key(value: unknown) {
  const raw = text(value);
  return /^[A-Za-z0-9_-]{8,80}$/.test(raw) ? raw : "";
}
