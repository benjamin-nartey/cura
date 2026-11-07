import type {SessionContext} from "@curasphere/contracts";
import {all,get,type AppDatabase} from "./db";
import {ForbiddenError,NotFoundError,ValidationError} from "./errors";

export const AGENT_TOOLS = {
  tool_chart_sources: {capability:"read",permitsExecution:true,effect:"read"},
  tool_propose_review: {capability:"draft",permitsExecution:false,effect:"approve"},
  tool_model_draft: {capability:"draft",permitsExecution:false,effect:"gateway"},
  tool_note_write: {capability:"draft",permitsExecution:false,effect:"draft-only"},
} as const;

export function parseAgentToolInput(payload:unknown): {patientId?:string} {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new ValidationError("invalid","That tool input is outside the local sandbox.");
  }
  const input = payload as Record<string,unknown>;
  if (Object.keys(input).some(key => key !== "patientId")
      || (Object.hasOwn(input,"patientId") && (typeof input.patientId !== "string" || !/^[A-Za-z0-9_-]{1,80}$/.test(input.patientId)))) {
    throw new ValidationError("invalid","That tool input is outside the local sandbox.");
  }
  return Object.hasOwn(input,"patientId") ? {patientId:input.patientId as string} : {};
}

export function agentPatientIds(db:AppDatabase, ctx:SessionContext, patientId:string | null = null) {
  if (!ctx.facilityId || ctx.purposeOfUse !== "TREATMENT" || !["clinician","nurse"].includes(ctx.role)) return [];
  return all<{patient_id:string}>(db,`
    SELECT DISTINCT e.patient_id FROM encounters e
    JOIN patients p ON p.id=e.patient_id AND p.organization_id=e.organization_id AND p.facility_id=e.facility_id
    WHERE e.organization_id=? AND e.facility_id=? AND e.author_id=? AND e.status<>'cancelled'
      AND (? IS NULL OR e.patient_id=?)
  `,ctx.organizationId,ctx.facilityId,ctx.userId,patientId,patientId).map(row => row.patient_id);
}

export function authorizeAgentPatient(db:AppDatabase, ctx:SessionContext, patientId:string) {
  if (!get(db,"SELECT id FROM patients WHERE id=? AND organization_id=? AND facility_id IS ?",
    patientId,ctx.organizationId,ctx.facilityId)) throw new NotFoundError();
  if (agentPatientIds(db,ctx,patientId).length === 0) throw new ForbiddenError("forbidden","This tool requires a patient relationship.");
}

export function readAgentChartSources(db:AppDatabase, ctx:SessionContext, patientId:string, deadline:number) {
  if (Date.now() >= deadline) return null;
  authorizeAgentPatient(db,ctx,patientId);
  const scope = [patientId,ctx.organizationId,ctx.facilityId] as const;
  const sources = all<{id:string}>(db,`
    SELECT id FROM conditions WHERE patient_id=? AND organization_id=? AND facility_id=?
    UNION ALL SELECT id FROM allergies WHERE patient_id=? AND organization_id=? AND facility_id=?
    UNION ALL SELECT id FROM medications WHERE patient_id=? AND organization_id=? AND facility_id=?
    UNION ALL SELECT id FROM observations WHERE patient_id=? AND organization_id=? AND facility_id=?
    UNION ALL SELECT id FROM encounters WHERE patient_id=? AND organization_id=? AND facility_id=?
    UNION ALL SELECT id FROM appointments WHERE patient_id=? AND organization_id=? AND facility_id=?
    ORDER BY id LIMIT 1001
  `,...scope,...scope,...scope,...scope,...scope,...scope);
  return Date.now() >= deadline || sources.length > 1000 ? null : {sourceIds:sources.map(source => source.id)};
}
