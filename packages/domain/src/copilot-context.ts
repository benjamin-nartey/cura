import type {SessionContext} from "@curasphere/contracts";
import {writeAudit} from "./audit";
import {canonicalHash} from "./briefing";
import {readCanonicalTimeline} from "./canonical-timeline";
import {get,transaction,type AppDatabase} from "./db";
import {AppError,ForbiddenError,NotFoundError,ValidationError} from "./errors";
import {readGraphClaims} from "./evidence-graph";
import {assertLocalHealthcareSandbox} from "./experimental-healthcare";
import {readMasterPatient} from "./master-records";
import {readSession} from "./session";
import {readTwinProjection} from "./twin-projection";

export const COPILOT_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const SOURCE_LIMIT = 24;
type Pointer = {id:string;version:number;recordedAt:string;sha256:string};
type ContextSource = {
  status:"available"|"empty"|"unavailable"|"stale"|"not-built"|"deadline";
  references:{reference:string;version:number}[];
  truncated:boolean;
};

function unavailable(status:ContextSource["status"]):ContextSource {
  return {status,references:[],truncated:false};
}

export function assertCopilotPatient(db:AppDatabase,ctx:SessionContext,patientId:string) {
  assertLocalHealthcareSandbox();
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(patientId)) throw new ValidationError();
  if (ctx.role !== "clinician" || ctx.purposeOfUse !== "TREATMENT" || !ctx.facilityId) throw new ForbiddenError();
  const clinician = get(db,`SELECT id FROM users WHERE id=? AND organization_id=?
    AND role='clinician' AND account_status='active'`,ctx.userId,ctx.organizationId);
  if (!clinician) throw new ForbiddenError();
  // Foundation identities are verified by the server entry points.
  if (!ctx.sessionId.startsWith("ses_")) {
    const session = readSession(db,ctx.sessionId);
    if (session?.userId !== ctx.userId || session.facilityId !== ctx.facilityId) throw new ForbiddenError();
  }
  const patient = readMasterPatient(db,ctx,patientId);
  if (patient.registration_status === "merged") throw new NotFoundError();
}

export function readCopilotContext(db:AppDatabase,ctx:SessionContext,patientId:string) {
  try {
    return transaction(db,() => {
      assertCopilotPatient(db,ctx,patientId);
      const now = Date.now();
      const cutoff = now - COPILOT_WINDOW_MS;
      const deadline = performance.now() + 2_000;
      function pack(pointers:Pointer[],truncated = false):ContextSource {
        const eligible = pointers.filter(pointer => {
          const recorded = Date.parse(pointer.recordedAt);
          return recorded >= cutoff && recorded <= now;
        }).sort((a,b) => b.recordedAt.localeCompare(a.recordedAt) || a.id.localeCompare(b.id));
        return {
          status:eligible.length ? "available" : "empty",
          references:eligible.slice(0,SOURCE_LIMIT).map(pointer => ({
            reference:canonicalHash([pointer.id,pointer.version,pointer.sha256]),
            version:pointer.version,
          })),
          truncated:truncated || eligible.length > SOURCE_LIMIT,
        };
      }
      function source(read:()=>ContextSource):ContextSource {
        if (performance.now() >= deadline) return unavailable("deadline");
        try {
          const result = read();
          return performance.now() >= deadline ? unavailable("deadline") : result;
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          return unavailable("unavailable");
        }
      }
      const twin = source(() => {
        const projection = readTwinProjection(db,ctx,patientId);
        if (projection.clockUncertain) return unavailable("unavailable");
        if (projection.status === "not-built") return unavailable("not-built");
        if (projection.status === "stale" || !projection.state) return unavailable("stale");
        return pack(projection.state.allFacts.map(fact => fact.source));
      });
      const timeline = source(() => pack(readCanonicalTimeline(db,ctx,patientId).events
        .filter(event => !event.historical)
        .map(event => ({id:event.id,version:event.source.version,recordedAt:event.recordedTime,sha256:event.source.sha256}))));
      const evidence = source(() => {
        const graph = readGraphClaims(db,ctx,patientId);
        return pack(graph.sources,graph.sourceCount > graph.sources.length);
      });
      writeAudit(db,ctx,{action:"copilot.context.read",resourceType:"CopilotContext",resourceId:patientId,outcome:"success"});
      return {
        contractVersion:1 as const,
        checkedAt:new Date(now).toISOString(),
        recordedFrom:new Date(cutoff).toISOString(),
        sources:{twin,timeline,evidence},
      };
    });
  } catch (error) {
    writeAudit(db,ctx,{action:"copilot.context.read",resourceType:"CopilotContext",resourceId:null,outcome:"denied"});
    throw error;
  }
}
