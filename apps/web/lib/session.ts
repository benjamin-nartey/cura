import { getDb, readBoundSession, revokeAuthSession } from "@curasphere/domain";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { endFoundationSession, readFoundationSession } from "@/lib/foundation";

export async function requireSession() {
  const jar = await cookies();
  const sid = jar.get("cura_session")?.value;
  if (!sid) redirect("/");
  const ctx = await readFoundationSession(sid);
  if (!ctx) redirect("/");
  const bound = readBoundSession(getDb(), sid);
  if (bound && !bound.active) {
    revokeAuthSession(getDb(), sid);
    await endFoundationSession(sid);
    redirect("/?error=expired");
  }
  return ctx;
}

export async function optionalSession() {
  const jar = await cookies();
  const sid = jar.get("cura_session")?.value;
  if (!sid) return null;
  const ctx = await readFoundationSession(sid);
  if (!ctx) return null;
  const bound = readBoundSession(getDb(), sid);
  if (bound && !bound.active) return null;
  return ctx;
}
