import { createConsent, getDb, listConsents } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { consentActor, consentFailure, requireConsentSession } from "@/lib/consent";
import { redirectTo } from "@/lib/http";

const PURPOSE = {
  COMMUNICATION: ["consent.communication.dispatch", "facility-messenger", "appointment-reminder"],
  SHARING: ["consent.sharing.release", "local-share-sink", "synthetic-record"],
  RESEARCH: ["consent.research.use", "research-workspace", "research-row"],
} as const;

function instant(value: FormDataEntryValue | null) {
  const text = String(value ?? "");
  if (!text) return null;
  return text.length === 16 ? `${text}:00.000Z` : text;
}

export async function GET() {
  const ctx = await requireConsentSession();
  if (!ctx) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  try {
    return NextResponse.json({ experimental: true, formalPhase03: "NOT_AUTHORIZED", consents: listConsents(getDb(), consentActor(ctx)) });
  } catch {
    return NextResponse.json({ error: "Consent records are limited to authorized staff." }, { status: 403 });
  }
}

export async function POST(request: Request) {
  const ctx = await requireConsentSession();
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  const purpose = String(form.get("purpose") ?? "COMMUNICATION");
  const mapped = PURPOSE[purpose as keyof typeof PURPOSE];
  if (!mapped) return redirectTo(request, "/consent/new", { error: "invalid" });
  try {
    const created = createConsent(getDb(), consentActor(ctx), {
      subjectId: String(form.get("subjectId") ?? ""),
      authorityId: String(form.get("authorityId") ?? ""),
      purpose: purpose as "COMMUNICATION" | "SHARING" | "RESEARCH",
      action: mapped[0],
      recipient: mapped[1],
      resourceCategory: mapped[2],
      effectiveAt: instant(form.get("effectiveAt")) ?? "",
      expiresAt: instant(form.get("expiresAt")),
      decision: form.get("decision") === "refused" ? "refused" : "granted",
      idempotencyKey: String(form.get("idempotencyKey") ?? ""),
    });
    return redirectTo(request, `/consent/${created.id}`);
  } catch (error) {
    return consentFailure(request, error, "/consent/new");
  }
}
