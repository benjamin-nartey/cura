import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readFoundationSession } from "@/lib/foundation";

export async function requireSession() {
  const jar = await cookies();
  const sid = jar.get("cura_session")?.value;
  if (!sid) redirect("/");
  const ctx = await readFoundationSession(sid);
  if (!ctx) redirect("/");
  return ctx;
}

export async function optionalSession() {
  const jar = await cookies();
  const sid = jar.get("cura_session")?.value;
  if (!sid) return null;
  return readFoundationSession(sid);
}
