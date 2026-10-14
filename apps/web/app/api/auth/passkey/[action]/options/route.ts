import { beginPasskeyAuthentication, beginPasskeyRegistration, getDb, pendingLoginOpen } from "@curasphere/domain";
import { cookies } from "next/headers";
import { currentSession } from "@/lib/http";
import { prepareIdentityDatabase } from "@/lib/workforce-auth";

export async function POST(_request: Request, context: { params: Promise<{ action: string }> }) {
  const { action } = await context.params;
  const db = await prepareIdentityDatabase();
  if (action === "register") {
    const ctx = await currentSession();
    if (!ctx) return Response.json({ error: "signin" }, { status: 401 });
    return Response.json(await beginPasskeyRegistration(db, ctx.userId, ctx.displayName));
  }
  if (action !== "authenticate") return Response.json({ error: "invalid" }, { status: 404 });
  const jar = await cookies();
  const pendingId = jar.get("cura_mfa")?.value ?? "";
  try {
    pendingLoginOpen(getDb(), pendingId);
  } catch {
    return Response.json({ error: "expired" }, { status: 400 });
  }
  const row = db.prepare("SELECT user_id FROM pending_logins WHERE id = ? AND consumed_at IS NULL").get(pendingId) as { user_id: string } | undefined;
  if (!row) return Response.json({ error: "expired" }, { status: 400 });
  return Response.json(await beginPasskeyAuthentication(db, row.user_id));
}
