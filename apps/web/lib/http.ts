import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AppError, getDb, readPatientSession } from "@curasphere/domain";
import { readFoundationSession } from "@/lib/foundation";

export async function currentSession() {
  const jar = await cookies();
  const sid = jar.get("cura_session")?.value;
  if (!sid) return null;
  return readFoundationSession(sid);
}

export async function currentPortal() {
  const jar = await cookies();
  const sid = jar.get("cura_portal")?.value;
  if (!sid) return null;
  return readPatientSession(getDb(), sid);
}

export function redirectTo(request: Request, path: string, query?: Record<string, string>) {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") ?? "http";
  const base = host ? `${proto}://${host}/` : request.url;
  const url = new URL(path, base);
  if (query) {
    for (const [key, value] of Object.entries(query)) url.searchParams.set(key, value);
  }
  return NextResponse.redirect(url, 303);
}

export function failureCode(error: unknown) {
  if (error instanceof AppError) return error.code;
  console.error("unexpected_write_failure");
  return "invalid";
}

export function formId(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  return /^[A-Za-z0-9_-]{1,80}$/.test(text) ? text : "";
}

export function withSession(response: NextResponse, sessionId: string) {
  response.cookies.set("cura_session", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.CURASPHERE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}

export function withPortal(response: NextResponse, sessionId: string) {
  response.cookies.set("cura_portal", sessionId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.CURASPHERE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
