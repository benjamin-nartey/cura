import { enrollTotp } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { currentSession, redirectTo } from "@/lib/http";
import { prepareIdentityDatabase } from "@/lib/workforce-auth";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const db = await prepareIdentityDatabase();
  const enrolled = enrollTotp(db, ctx.userId);
  const response = redirectTo(request, "/auth/enroll");
  const cookie = { httpOnly: true, sameSite: "lax" as const, secure: process.env.CURASPHERE_ENV === "production", path: "/auth/enroll", maxAge: 300 };
  response.cookies.set("cura_totp_setup", enrolled.secret, cookie);
  response.cookies.set("cura_totp_recovery", enrolled.recovery.join(","), cookie);
  return response;
}

export async function GET() {
  return NextResponse.json({ error: "invalid" }, { status: 405 });
}
