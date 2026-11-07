import { NextResponse, type NextRequest } from "next/server";
import { allowedMobileOrigin } from "./lib/mobile-origin";
import { isSmartClientHost } from "@curasphere/contracts";

// CORS for the existing bearer-authenticated patient mobile API. It never
// grants cookie credentials and never enables a production browser preview.
export function proxy(request: NextRequest) {
  const hosts=[request.nextUrl.hostname,...[request.headers.get("host"),request.headers.get("x-forwarded-host")].filter(Boolean).flatMap(value=>value!.split(",").map(part=>{try{return new URL(`http://${part.trim()}`).hostname;}catch{return "";}}))];
  if(hosts.some(isSmartClientHost))return NextResponse.json({error:"reserved-client-host"},{status:403,headers:{"cache-control":"no-store"}});
  if(request.nextUrl.pathname.startsWith("/interop/apps")||request.nextUrl.pathname.startsWith("/interop/partners")||request.nextUrl.pathname.startsWith("/interop/reconciliation")||request.nextUrl.pathname.startsWith("/interop/conformance")){
    const response=NextResponse.next();response.headers.set("x-frame-options","DENY");response.headers.set("content-security-policy","frame-ancestors 'none'; base-uri 'self'; object-src 'none'");response.headers.set("referrer-policy",request.nextUrl.pathname.endsWith("/callback")?"no-referrer":"same-origin");response.headers.set("cache-control","no-store");return response;
  }
  if(request.nextUrl.pathname!=="/api/patient-app"&&!request.nextUrl.pathname.startsWith("/api/patient-app/"))return NextResponse.next();
  const origin = request.headers.get("origin");
  if (!origin) return NextResponse.next();
  const local = process.env.CURASPHERE_ENV === "local" && process.env.CURASPHERE_DATA_CLASS === "synthetic" && process.env.CURASPHERE_DEV_DIRECTORY === "local-test" && process.env.CURASPHERE_LOCAL_PHASE_OVERRIDE === "true";
  if (!local || !allowedMobileOrigin(request)) return NextResponse.json({ error: "forbidden" }, { status: 403, headers: { "cache-control": "no-store", vary: "Origin" } });
  const result = request.method === "OPTIONS" ? new NextResponse(null, { status: 204 }) : NextResponse.next();
  result.headers.set("access-control-allow-origin", origin);
  result.headers.set("access-control-allow-methods", "GET, POST, OPTIONS");
  result.headers.set("access-control-allow-headers", "authorization, content-type");
  result.headers.set("vary", "Origin");
  return result;
}
export const config = { matcher: "/:path*" };
