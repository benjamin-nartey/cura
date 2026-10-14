import { AppError, getDb, listTenancy, mirrorTenancySession, seedDemoTenants } from "@curasphere/domain";
import { currentSession } from "@/lib/http";

export async function GET(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return Response.json({ error: "signin" }, { status: 401 });
  const db = getDb();
  seedDemoTenants(db);
  try {
    mirrorTenancySession(db, ctx.sessionId, ctx.userId);
    const view = listTenancy(db, ctx.sessionId, new Headers(request.headers));
    return Response.json(view);
  } catch (error) {
    if (error instanceof AppError) {
      const status = error.code === "notfound" ? 404 : error.code === "conflict" ? 409 : error.code === "invalid" ? 400 : 403;
      return Response.json({ error: error.code }, { status });
    }
    return Response.json({ error: "unavailable" }, { status: 503 });
  }
}
