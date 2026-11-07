import {get,run,type AppDatabase} from "./db";
import {InvalidProviderResponse,type GatewayAdapter,type GatewayAdapterInput} from "./gateway-provider";

export const GATEWAY_RUNTIME_SCHEMA = `
CREATE TABLE gateway_dispatch_units (
  trace_id TEXT NOT NULL REFERENCES gateway_attempts(id) DEFERRABLE INITIALLY DEFERRED,
  ordinal INTEGER NOT NULL CHECK (ordinal BETWEEN 1 AND 2),
  units INTEGER NOT NULL CHECK (units > 0),
  result TEXT NOT NULL CHECK (result IN ('response','invalid','timeout','unavailable')),
  PRIMARY KEY (trace_id, ordinal)
);
CREATE TABLE gateway_circuits (
  organization_id TEXT NOT NULL REFERENCES organizations(id),
  provider TEXT NOT NULL,
  model_id TEXT NOT NULL,
  model_version TEXT NOT NULL,
  failures INTEGER NOT NULL CHECK (failures BETWEEN 0 AND 3),
  open_until INTEGER NOT NULL,
  PRIMARY KEY (organization_id, provider, model_id, model_version)
);
`;

export function dispatchWithBudget(db:AppDatabase, organizationId:string, adapter:GatewayAdapter, request:GatewayAdapterInput) {
  const scope = [organizationId,adapter.provider,adapter.modelId,adapter.modelVersion] as const;
  const units = Math.max(1,Math.ceil(request.redactedInput.length / 4));
  let reason = "provider-down";
  for (let ordinal = 1; ordinal <= 2; ordinal++) {
    const circuit = get<{failures:number;open_until:number}>(db,
      "SELECT failures,open_until FROM gateway_circuits WHERE organization_id=? AND provider=? AND model_id=? AND model_version=?",...scope);
    if (circuit && circuit.open_until > Date.now()) return {outcome:"unavailable",reason:"circuit-open"} as const;
    const reserved = run(db,
      "UPDATE gateway_quotas SET tokens_used=tokens_used+? WHERE organization_id=? AND tokens_used+?<=token_budget",
      units,organizationId,units);
    if (!reserved.changes) return {outcome:"quota",reason:"budget"} as const;
    const started = performance.now();
    let output:unknown;
    let result:"response"|"invalid"|"timeout"|"unavailable" = "response";
    try {
      output = adapter.invoke({...request,deadlineAt:Date.now()+500});
    } catch (error) {
      result = error instanceof InvalidProviderResponse ? "invalid" : "unavailable";
    }
    if (performance.now()-started >= 500) result = "timeout";
    const failed = result === "timeout" || result === "unavailable";
    const failures = failed ? Math.min(3,(circuit?.failures ?? 0)+1) : 0;
    run(db,`INSERT INTO gateway_circuits VALUES (?,?,?,?,?,?)
      ON CONFLICT(organization_id,provider,model_id,model_version)
      DO UPDATE SET failures=excluded.failures,open_until=excluded.open_until`,
      ...scope,failures,failures === 3 ? Date.now()+30_000 : 0);
    run(db,"INSERT INTO gateway_dispatch_units VALUES (?,?,?,?)",request.traceId,ordinal,units,result);
    if (result === "response") return {outcome:"response",output} as const;
    if (result === "invalid") return {outcome:"invalid-output",reason:"schema"} as const;
    reason = result === "timeout" ? "provider-timeout" : "provider-down";
    if (failures === 3) break;
  }
  return {outcome:"unavailable",reason} as const;
}
