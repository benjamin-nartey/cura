import { evaluateConsent, getDb } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { consentActor, requireConsentSession } from "@/lib/consent";

export async function POST(request: Request) {
  const ctx = await requireConsentSession();
  if (!ctx) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  if (process.env.CURASPHERE_ENV === "production" || process.env.CURASPHERE_ENV === "staging") {
    return NextResponse.json({ error: "The decision inspector is not available in this environment." }, { status: 403 });
  }
  const body = (await request.json()) as { subjectId?: string; action?: string; purpose?: string; recipient?: string; resourceCategory?: string };
  const decision = evaluateConsent(getDb(), consentActor(ctx), {
    subjectId: String(body.subjectId ?? ""),
    action: String(body.action ?? ""),
    purpose: String(body.purpose ?? ""),
    recipient: String(body.recipient ?? ""),
    resourceCategory: String(body.resourceCategory ?? ""),
  });
  return NextResponse.json({ experimental: true, formalPhase03: "NOT_AUTHORIZED", ...decision });
}
