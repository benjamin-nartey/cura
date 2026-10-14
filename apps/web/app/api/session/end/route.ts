import { closeSession, getDb, revokeAuthSession } from "@curasphere/domain";
import { cookies } from "next/headers";
import { endFoundationSession } from "@/lib/foundation";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const jar = await cookies();
  const sid = jar.get("cura_session")?.value;
  const previous = jar.get("cura_foundation")?.value;
  if (sid?.startsWith("ses_")) {
    revokeAuthSession(getDb(), sid);
    await endFoundationSession(sid);
  } else if (sid) closeSession(getDb(), sid);
  if (previous && previous !== sid) await endFoundationSession(previous);
  const response = redirectTo(request, "/");
  response.cookies.set("cura_session", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  response.cookies.set("cura_foundation", "", { httpOnly: true, sameSite: "lax", path: "/", maxAge: 0 });
  return response;
}
