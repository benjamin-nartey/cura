import type {SessionContext} from "@curasphere/contracts";
import {writeAudit} from "./audit";
import {assertCopilotPatient,COPILOT_WINDOW_MS} from "./copilot-context";
import {transaction,type AppDatabase} from "./db";
import {AppError} from "./errors";
import {readTwinProjection,type TwinStateFact} from "./twin-projection";

type Section = "issues"|"medications"|"allergies"|"observations"|"pending";
type SummaryClaim = {
  text:string;
  certainty:"recorded"|"review";
  citation:{factId:string;version:number;recordedAt:string;sha256:string};
};
const sections:Section[] = ["issues","medications","allergies","observations","pending"];
const MAX_CLAIMS = 12;
const text = (value:unknown) => typeof value === "string" && value.trim() && value.length <= 160 ? value : null;

function quantity(value:unknown,unit:unknown) {
  const label = text(unit);
  return typeof value === "number" && Number.isFinite(value) && label ? `${value} ${label}` : null;
}

function claimText(section:Section,fact:TwinStateFact) {
  const fields = fact.fields;
  const label = text(fields.display) ?? text(fields.code);
  if (!label) return null;
  switch (section) {
    case "issues": {
      const status = text(fields.clinicalStatus);
      const verification = text(fields.verificationStatus);
      return status && verification ? `${label} · ${status}, ${verification}` : null;
    }
    case "medications": {
      const dose = quantity(fields.dose,fields.unit);
      return fields.status === "draft" && fields.executable === false && dose ? `${label} · draft dose ${dose}` : null;
    }
    case "allergies": {
      const verification = text(fields.verificationStatus);
      return verification ? `${label} · ${verification}` : null;
    }
    case "observations": {
      const status = text(fields.status);
      if (!status) return null;
      const value = quantity(fields.value,fields.unit);
      if (value) return `${label} · ${value} · ${status}`;
      if (!Array.isArray(fields.components) || !fields.components.length || fields.components.length > 12) return null;
      const components = fields.components.map(component => {
        if (!component || typeof component !== "object") return null;
        const code = text(component.code);
        const measurement = quantity(component.value,component.unit);
        return code && measurement ? `${code} ${measurement}` : null;
      });
      return components.every(Boolean) ? `${label} · ${components.join(", ")} · ${status}` : null;
    }
    case "pending": {
      const status = text(fields.status);
      return status ? `${label} · ${status}` : null;
    }
  }
}

export function readGroundedCopilotSummary(db:AppDatabase,ctx:SessionContext,patientId:string) {
  try {
    return transaction(db,() => {
      assertCopilotPatient(db,ctx,patientId);
      const now = Date.now();
      const cutoff = now - COPILOT_WINDOW_MS;
      const base = {contractVersion:1 as const,checkedAt:new Date(now).toISOString(),recordedFrom:new Date(cutoff).toISOString()};
      let projection:ReturnType<typeof readTwinProjection> | null;
      try {
        projection = readTwinProjection(db,ctx,patientId);
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        projection = null;
      }
      const state = projection?.state;
      const ready = projection?.status === "current" && !projection.clockUncertain && state && projection.build;
      const candidates:Record<Section,TwinStateFact[]> = {
        issues:ready ? state.problems.active : [],
        medications:ready ? state.medicationDrafts.filter(fact => fact.fields.status === "draft") : [],
        allergies:ready ? state.allergyAssessments : [],
        observations:ready ? state.observations.recent : [],
        pending:ready ? state.work.pending : [],
      };
      const conflictIds = new Set(ready ? state.conflicts.flatMap(conflict => conflict.sourceIds) : []);
      const result = sections.map(section => {
        const claims:SummaryClaim[] = [];
        let withheld = section === "observations" && ready ? state.observations.unprioritized.length : 0;
        const facts = candidates[section].filter(fact => {
          const recorded = Date.parse(fact.source.recordedAt);
          return recorded >= cutoff && recorded <= now;
        }).sort((a,b) => b.source.recordedAt.localeCompare(a.source.recordedAt) || a.id.localeCompare(b.id));
        for (const fact of facts.slice(0,MAX_CLAIMS)) {
          const claim = claimText(section,fact);
          if (!claim || conflictIds.has(fact.id)) {
            withheld++;
            continue;
          }
          const {version,recordedAt,sha256} = fact.source;
          claims.push({
            text:claim,
            certainty:fact.fields.verificationStatus === "unconfirmed" || fact.fields.status === "preliminary" ? "review" : "recorded",
            citation:{factId:fact.id,version,recordedAt,sha256},
          });
        }
        return {section,claims,withheld,truncated:facts.length > MAX_CLAIMS};
      });
      writeAudit(db,ctx,{action:"copilot.summary.read",resourceType:"CopilotSummary",resourceId:patientId,outcome:"success"});
      return {
        ...base,
        status:ready ? "current" as const : !projection || projection.clockUncertain ? "unavailable" as const : projection.status,
        buildId:ready ? ready.id : null,
        sourceThroughAt:ready ? ready.sourceThroughAt : null,
        sections:result,
      };
    });
  } catch (error) {
    writeAudit(db,ctx,{action:"copilot.summary.read",resourceType:"CopilotSummary",resourceId:null,outcome:"denied"});
    throw error;
  }
}
