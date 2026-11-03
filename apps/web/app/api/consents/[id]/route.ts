import { consentHistory, getDb, readConsent } from "@curasphere/domain";
import { NotFoundError } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { consentActor, requireConsentSession } from "@/lib/consent";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireConsentSession();
  const { id } = await context.params;
  if (!ctx) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    const row = readConsent(getDb(), consentActor(ctx), id);
    return NextResponse.json({ experimental: true, consent: row, history: consentHistory(getDb(), consentActor(ctx), id) });
  } catch (error) {
    if (error instanceof NotFoundError) return NextResponse.json({ error: "That consent record is not available." }, { status: 404 });
    return NextResponse.json({ error: "Consent records are limited to authorized staff." }, { status: 403 });
  }
}
