import { closeSession, getDb } from "@curasphere/domain";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { endFoundationSession } from "@/lib/foundation";

export async function POST(request: Request) {
  const jar = await cookies();
  const sid = jar.get("cura_session")?.value;
  const previous = jar.get("cura_foundation")?.value;
  if (sid?.startsWith("ses_")) await endFoundationSession(sid);
  else if (sid) closeSession(getDb(), sid);
  if (previous && previous !== sid) await endFoundationSession(previous);
  const response = NextResponse.redirect(new URL("/", request.url), 303);
  response.cookies.set("cura_session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set("cura_foundation", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
