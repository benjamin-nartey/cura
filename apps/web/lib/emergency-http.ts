import { NextResponse } from "next/server";
import { optionalSession } from "@/lib/session";
import { emergencyActor } from "@/lib/emergency";

export function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Boolean(host && new URL(origin).host === host);
}

export async function emergencyCaller() {
  const ctx = await optionalSession();
  if (!ctx) return null;
  return { ctx, actor: emergencyActor(ctx) };
}

export function denied() {
  return NextResponse.json({ error: "This action is not available." }, { status: 403 });
}
