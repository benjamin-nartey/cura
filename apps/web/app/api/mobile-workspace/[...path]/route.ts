import { AppError, assertLocalHealthcareSandbox, effectivePermissions, getDb, listAppointments, listCharges, listMasterPatients, listPending, readBoundSession, readDashboard, readUnifiedChart } from "@curasphere/domain";
import { endFoundationSession, openFoundationSession, readFoundationDirectory, readFoundationSession } from "@/lib/foundation";
import { allowedMobileOrigin } from "@/lib/mobile-origin";
import { NextResponse } from "next/server";

type Context = { params: Promise<{ path: string[] }> };


function response(request: Request, data: unknown, status = 200) {
  const headers: Record<string, string> = { "cache-control": "no-store", vary: "Origin", "x-content-type-options": "nosniff" };
  const origin = request.headers.get("origin");
  if (origin && allowedMobileOrigin(request)) headers["access-control-allow-origin"] = origin;
  headers["access-control-allow-methods"] = "GET, POST, OPTIONS";
  headers["access-control-allow-headers"] = "authorization, content-type";
  return status === 204 ? new NextResponse(null, { status, headers }) : NextResponse.json(data, { status, headers });
}

async function handle(request: Request, context: Context) {
  const reply = (data: unknown, status = 200) => response(request, data, status);
  try { assertLocalHealthcareSandbox(); } catch { return reply({ error: "disabled" }, 403); }
  if (!allowedMobileOrigin(request)) return reply({ error: "forbidden" }, 403);
  if (request.method === "OPTIONS") return response(request, null, 204);
  const segments = (await context.params).path;
  const operation = segments.join("/");
  try {
    if (request.method === "GET" && operation === "directory") {
      const directory = await readFoundationDirectory();
      if (directory.disabled) return reply({ error: "disabled" }, 403);
      if (directory.unavailable) return reply({ error: "unavailable" }, 503);
      return reply({ entries: directory.entries, dataClass: "synthetic", contractVersion: 1 });
    }
    if (request.method === "POST" && operation === "session") {
      if (!request.headers.get("content-type")?.startsWith("application/json")) return reply({ error: "invalid" }, 400);
      const raw = await request.text();
      if (raw.length > 4096) return reply({ error: "invalid" }, 400);
      let input: { userId?: unknown };
      try { input = JSON.parse(raw); } catch { return reply({ error: "invalid" }, 400); }
      if (!input || typeof input.userId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(input.userId)) return reply({ error: "invalid" }, 400);
      const opened = await openFoundationSession(input.userId);
      if (opened.status !== "ok") return reply({ error: opened.status }, opened.status === "disabled" ? 403 : 503);
      const ctx = await readFoundationSession(opened.sessionId);
      const user = ctx && getDb().prepare("SELECT account_status FROM users WHERE id = ?").get(ctx.userId) as { account_status: string } | undefined;
      if (!ctx || !user || user.account_status !== "active") {
        await endFoundationSession(opened.sessionId);
        return reply({ error: "forbidden" }, 403);
      }
      const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
      if (access.permissions.length === 0 || access.review.includes("not active")) {
        await endFoundationSession(opened.sessionId);
        return reply({ error: "forbidden" }, 403);
      }
      return reply({ sessionId: ctx.sessionId, displayName: ctx.displayName, facilityName: ctx.facilityName, organizationName: ctx.organizationName, permissions: access.permissions, dataClass: "synthetic", contractVersion: 1 });
    }
    const token = /^Bearer (ses_[A-Za-z0-9_-]{8,76})$/.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token) return reply({ error: "signin" }, 401);
    const ctx = await readFoundationSession(token);
    const bound = readBoundSession(getDb(), token);
    if (!ctx || bound && !bound.active) return reply({ error: "signin" }, 401);
    const user = getDb().prepare("SELECT account_status FROM users WHERE id = ?").get(ctx.userId) as { account_status: string } | undefined;
    if (!user || user.account_status !== "active") return reply({ error: "signin" }, 401);
    const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
    if (access.permissions.length === 0 || access.review.includes("not active")) return reply({ error: "forbidden" }, 403);
    if (request.method === "POST" && operation === "signout") {
      await endFoundationSession(token);
      return reply({ signedOut: true });
    }
    if (request.method !== "GET") return reply({ error: "method" }, 405);
    const actor = { userId: ctx.userId, organizationId: ctx.organizationId, facilityId: ctx.facilityId, sessionId: token };
    const url = new URL(request.url);
    if (operation === "dashboard") return reply(readDashboard(getDb(), ctx));
    if (operation === "patients") return reply({ records: listMasterPatients(getDb(), actor, (url.searchParams.get("q") ?? "").slice(0, 80)), limit: 50 });
    if (operation === "appointments") return reply({ records: listAppointments(getDb(), actor), limit: 50 });
    if (operation === "work") return reply(listPending(getDb(), actor));
    if (operation === "charges") return reply({ records: listCharges(getDb(), actor) });
    if (segments.length === 2 && segments[0] === "chart" && /^[A-Za-z0-9_-]{1,80}$/.test(segments[1]!)) return reply(readUnifiedChart(getDb(), actor, segments[1]!));
    return reply({ error: "notfound" }, 404);
  } catch (error) {
    if (error instanceof AppError) return reply({ error: error.code }, error.code === "forbidden" ? 403 : error.code === "notfound" ? 404 : 400);
    console.error("mobile_workspace_failure");
    return reply({ error: "unavailable" }, 503);
  }
}

export const GET = handle;
export const POST = handle;
export const OPTIONS = handle;
