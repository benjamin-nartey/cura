import {createHash} from 'node:crypto';
import type {SessionContext} from '@curasphere/contracts';
import {all,type AppDatabase} from './db';
import {readCanonicalTimeline} from './canonical-timeline';
import type {readTwinSourceInventory} from './twin-evidence';
import {AppError} from './errors';

export const GRAPH_RELATIONSHIPS = ['supported','contradicting','insufficient'] as const;
export type GraphRelationship = typeof GRAPH_RELATIONSHIPS[number];
export type GraphSourceFormat = 'timeline' | 'fhir-r4' | 'local-document';
type Inventory = ReturnType<typeof readTwinSourceInventory>;
type GraphSourceScope = {context:SessionContext; patientId:string};
export type GraphSourceDocument={id:string;organization_id:string;facility_id:string;patient_id:string;owner_id:string;purpose:string;coverage:string;title:string;content:string;effective_at:string|null;recorded_at:string;version:1;sha256:string};
export type GraphSourceEdge={id:string;claim_id:string;revision_id:string;relationship:GraphRelationship;source_format:GraphSourceFormat;source_id:string;source_json:string;recorded_at:string;sha256:string};
type Source={id:string;format:GraphSourceFormat;recordId:string;version:number;sha256:string;recordedAt:string;effectiveAt:string|null;timePrecision:'instant'|'date'|'unknown';label:string;provenance:unknown};
export const graphSourceHash=(x:unknown)=>createHash('sha256').update(JSON.stringify(x)).digest('hex');

const unavailable = () => new AppError('unavailable','Exact source integrity or access is unavailable. Restore services and refresh.');

export function documentPayload(d:Omit<GraphSourceDocument,'sha256'>|GraphSourceDocument){return {id:d.id,organization:d.organization_id,facility:d.facility_id,patient:d.patient_id,owner:d.owner_id,purpose:d.purpose,coverage:d.coverage,title:d.title,content:d.content,effectiveAt:d.effective_at,recordedAt:d.recorded_at,version:d.version};}
export function readGraphSourceCatalog(db:AppDatabase, scope:GraphSourceScope, inventory:Inventory) {
 const timeline=readCanonicalTimeline(db,scope.context,scope.patientId);
 const documents=all<GraphSourceDocument>(db,'SELECT * FROM graph_documents WHERE organization_id=? AND facility_id=? AND patient_id=? AND owner_id=? AND purpose=? AND coverage=? ORDER BY id LIMIT 101',scope.context.organizationId,scope.context.facilityId!,scope.patientId,scope.context.userId,scope.context.purposeOfUse,inventory.coverage);
 if(documents.length>100||documents.some(d=>graphSourceHash(documentPayload(d))!==d.sha256))throw unavailable();
 const sources:Source[]=[];
 for(const f of inventory.facts){
  const event=timeline.events.find(e=>!e.historical&&e.source.ledgerId===f.ledgerId&&e.source.sha256===f.sha256),label=String(f.snapshot.display??f.snapshot.code??f.kind);
  const source:Source={id:f.id,format:'timeline',recordId:f.recordId,version:f.version,sha256:f.sha256,recordedAt:f.recordedAt,effectiveAt:event?.eventTime??null,timePrecision:event?.timePrecision??'unknown',label,provenance:inventory.pointers.find(p=>p.id===f.id)!};sources.push(source);
  if(['condition','allergy','observation','medication-order','work:order'].includes(f.kind))sources.push({...source,format:'fhir-r4'});
 }
 for(const d of documents)sources.push({id:d.id,format:'local-document',recordId:d.id,version:1,sha256:d.sha256,recordedAt:d.recorded_at,effectiveAt:d.effective_at,timePrecision:d.effective_at?'instant':'unknown',label:d.title,provenance:{authorId:d.owner_id,synthetic:true,sourceClass:'owner-provided-document'}});
 return {documents,sources};
}
export function edgePayload(e:Omit<GraphSourceEdge,'sha256'>|GraphSourceEdge){return {id:e.id,claim:e.claim_id,revision:e.revision_id,relationship:e.relationship,format:e.source_format,sourceId:e.source_id,source:JSON.parse(e.source_json),recordedAt:e.recorded_at};}

export function resolveGraphSource(edge: GraphSourceEdge, catalog: readonly Source[]) {
  const payload = edgePayload(edge);
  if (!GRAPH_RELATIONSHIPS.includes(edge.relationship) || graphSourceHash(payload) !== edge.sha256) {
    throw unavailable();
  }
  const current = catalog.find(source => source.id === edge.source_id && source.format === edge.source_format);
  return current && graphSourceHash(current) === graphSourceHash(payload.source) ? current : null;
}

export function graphSourceLinksChanged(
  db: AppDatabase,
  claimId: string,
  revisionId: string,
  catalog: () => readonly Source[],
) {
  const links = all<GraphSourceEdge>(
    db,
    'SELECT * FROM graph_source_edges WHERE claim_id=? AND revision_id=? LIMIT 101',
    claimId,
    revisionId,
  );
  if (links.length > 100) throw unavailable();
  if (!links.length) return false;
  const sources = catalog();
  // Check every edge so corrupt lineage fails closed even if another edge is stale.
  return links.map(link => resolveGraphSource(link, sources)).some(source => source === null);
}
