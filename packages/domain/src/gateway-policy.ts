import {createHash} from "node:crypto";
import type {SessionContext} from "@curasphere/contracts";
import {get, type AppDatabase} from "./db";
import {assertLocalHealthcareSandbox} from "./experimental-healthcare";
import type {GatewayAdapter} from "./gateway";
import {readSession} from "./session";

export function authorizeProviderDispatch(
  db: AppDatabase,
  ctx: SessionContext,
  prompt: {purpose: string; output_schema_json: string},
  adapter: GatewayAdapter,
  redactedInput: string,
): {input: string; approvalHash: string} | {denial: string} {
  try {
    assertLocalHealthcareSandbox();
  } catch {
    return {denial: "policy"};
  }
  if (prompt.purpose !== "control-plane") return {denial: "intended-use"};

  const session = readSession(db, ctx.sessionId);
  if (!session || !ctx.facilityId || session.userId !== ctx.userId
      || session.organizationId !== ctx.organizationId || session.facilityId !== ctx.facilityId
      || session.role !== ctx.role || session.purposeOfUse !== ctx.purposeOfUse) {
    return {denial: "scope"};
  }
  const scope = get<{jurisdiction: string | null}>(db, `
    SELECT o.jurisdiction
    FROM sessions s
    JOIN users u ON u.id = s.user_id AND u.account_status = 'active'
    JOIN organizations o ON o.id = u.organization_id AND o.status = 'active'
    JOIN facilities f ON f.id = u.facility_id AND f.organization_id = o.id AND f.status = 'active'
    JOIN organization_memberships om ON om.user_id = u.id AND om.organization_id = o.id AND om.status = 'active'
    JOIN facility_memberships fm ON fm.user_id = u.id AND fm.organization_id = o.id
      AND fm.facility_id = f.id AND fm.role = u.role AND fm.status = 'active'
    WHERE s.id = ?
      AND s.revoked_at IS NULL AND julianday(s.expires_at) > julianday(?)
      AND (s.active_organization_id IS NULL OR s.active_organization_id = o.id)
      AND (s.active_facility_id IS NULL OR s.active_facility_id = f.id)
      AND NOT EXISTS (SELECT 1 FROM tenancy_controls WHERE id = 1 AND dependency = 'unavailable')
  `, ctx.sessionId, new Date().toISOString());
  if (!scope) return {denial: "scope"};
  if (scope.jurisdiction !== "local-synthetic") return {denial: "jurisdiction"};

  let policy: Record<string, unknown>;
  try {
    const value: unknown = JSON.parse(prompt.output_schema_json)?.dispatchPolicy;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {denial: "approval"};
    policy = value as Record<string, unknown>;
  } catch {
    return {denial: "approval"};
  }
  if (policy.version !== 1 || policy.dataClass !== "synthetic"
      || policy.organizationId !== ctx.organizationId || policy.facilityId !== ctx.facilityId
      || policy.jurisdiction !== scope.jurisdiction || policy.purpose !== ctx.purposeOfUse
      || policy.provider !== adapter.provider || policy.modelId !== adapter.modelId
      || policy.modelVersion !== adapter.modelVersion) {
    return {denial: "approval"};
  }
  const inputs: unknown = policy.approvedInputs;
  if (!Array.isArray(inputs) || inputs.length < 1 || inputs.length > 8
      || inputs.some(input => typeof input !== "string" || input.length < 1 || input.length > 240)) {
    return {denial: "approval"};
  }
  // Dispatch the configured fixture value. Free-form text never enters the adapter.
  const input = inputs.find(value => value === redactedInput);
  if (typeof input !== "string") return {denial: "input-not-approved"};
  const approvalHash = createHash("sha256").update(prompt.output_schema_json).digest("hex");
  return {input, approvalHash};
}
