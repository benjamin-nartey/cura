import { closePatientSession, getDb } from "@curasphere/domain";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const jar = await cookies();
  const sid = jar.get("cura_portal")?.value;
  if (sid) closePatientSession(getDb(), sid);
  const response = NextResponse.redirect(new URL("/portal", request.url), 303);
  response.cookies.set("cura_portal", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
