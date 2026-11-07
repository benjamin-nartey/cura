import {
  addWorkforceFacility,
  assignWorkforceRole,
  getDb,
  offboardWorkforce,
  reactivateWorkforce,
  readWorkforceMember,
  revokeWorkforceRole,
  suspendWorkforce,
  transferWorkforce,
  workforceActor,
  workforceHistory,
} from "@curasphere/domain";
import { NextResponse } from "next/server";
import { failureCode, formId, redirectTo } from "@/lib/http";
import { optionalSession } from "@/lib/session";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await optionalSession();
  if (!ctx) return NextResponse.json({ error: "Sign in is required." }, { status: 401 });
  const { id } = await context.params;
  try {
    const member = readWorkforceMember(getDb(), workforceActor(ctx), formId(id));
    const history = workforceHistory(getDb(), workforceActor(ctx), formId(id));
    return NextResponse.json({ member, history });
  } catch {
    return NextResponse.json({ error: "That record is not available." }, { status: 404 });
  }
}

function sameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  return Boolean(host && new URL(origin).host === host);
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!sameOrigin(request)) return redirectTo(request, "/workforce", { error: "forbidden" });
  const ctx = await optionalSession();
  if (!ctx) return redirectTo(request, "/");
  const { id } = await context.params;
  const userId = formId(id);
  const form = await request.formData();
  const action = String(form.get("action") ?? "");
  const version = Number(form.get("version"));
  const reason = String(form.get("reason") ?? "").slice(0, 200);
  const facilityId = formId(form.get("facilityId"));
  const actor = workforceActor(ctx, String(form.get("assurance") ?? "") === "mfa" ? "mfa" : "directory");
  try {
    if (action === "role") {
      assignWorkforceRole(getDb(), actor, { userId, roleId: formId(form.get("roleId")), facilityId, expectedVersion: version, reason });
    } else if (action === "add-facility") {
      addWorkforceFacility(getDb(), actor, { userId, facilityId, roleId: formId(form.get("roleId")) || "nurse", reason });
    } else if (action === "transfer") {
      transferWorkforce(getDb(), actor, { userId, fromFacilityId: formId(form.get("fromFacilityId")), toFacilityId: facilityId, expectedVersion: version, reason });
    } else if (action === "suspend") {
      suspendWorkforce(getDb(), actor, { userId, scope: form.get("scope") === "organization" ? "organization" : "facility", facilityId, expectedVersion: version, reason });
    } else if (action === "reactivate") {
      reactivateWorkforce(getDb(), actor, { userId, scope: form.get("scope") === "organization" ? "organization" : "facility", facilityId, expectedVersion: version, reason });
    } else if (action === "revoke") {
      offboardWorkforce(getDb(), actor, { userId, expectedVersion: version, reason });
    } else if (action === "revoke-role") {
      revokeWorkforceRole(getDb(), actor, formId(form.get("assignmentId")), version);
    } else return redirectTo(request, `/workforce/${userId}`, { error: "invalid" });
    return redirectTo(request, `/workforce/${userId}`, { notice: action });
  } catch (error) {
    return redirectTo(request, `/workforce/${userId}`, { error: failureCode(error) });
  }
}
