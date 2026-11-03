import { getDb, listConsents } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { consentActor, requireConsentSession } from "@/lib/consent";

export async function GET() {
  const ctx = await requireConsentSession();
  if (!ctx) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const rows = listConsents(getDb(), consentActor(ctx));
    return NextResponse.json({ experimental: true, formalPhase03: "NOT_AUTHORIZED", consents: rows });
  } catch {
    return NextResponse.json({ error: "Consent records are limited to authorized staff." }, { status: 403 });
  }
}
