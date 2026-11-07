import assert from 'node:assert/strict';
import test from 'node:test';
import {assessEvidence} from '../src/evidence-sufficiency';

test('local sufficiency abstains for missing, duplicate, stale and conflicting evidence', () => {
 const source = {recordId:'observation-1', effectiveAt:'2026-01-15T09:00:00Z'};
 const support = {relationship:'supported' as const, source};
 assert.deepEqual(assessEvidence('source-assertion', false, []).flags, ['missing-support']);
 assert.equal(assessEvidence('source-assertion', false, [support]).status, 'meets-local-rule');
 assert.equal(assessEvidence('hypothesis', false, [support, support]).status, 'insufficient');
 const corroborated = [support, {...support, source:{...source, recordId:'observation-2'}}];
 assert.equal(assessEvidence('hypothesis', false, corroborated).evidenceState, 'unverified');
 assert.equal(assessEvidence('hypothesis', false, corroborated).status, 'meets-local-rule');
 assert.ok(assessEvidence('hypothesis', true, corroborated).flags.includes('stale-source'));
 assert.ok(assessEvidence('hypothesis', false, [...corroborated, {relationship:'contradicting', source}]).flags.includes('contradiction'));
 assert.ok(assessEvidence('risk-question', false, [{...support, source:{...source, effectiveAt:null}}]).flags.includes('unknown-effective-time'));
});
import {mkdtempSync,writeFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {sourceScenario} from './fhir-source-fixtures';
import {readGraphClaims,recordGraphClaim} from '../src/evidence-graph';
import {readGraphSources,ingestGraphSource,type GraphIngestionCommand} from '../src/evidence-ingestion';
import {correctObservation,setSourceDependency} from '../src/clinical-source';
import {openSession,readSession} from '../src/session';
import {DEMO_GH} from '../src/tenancy';
import {get,createDatabase} from '../src/db';
import {EVIDENCE_INGESTION_FIXTURE_ROLLBACK} from '../src/evidence-ingestion-schema';
const patient='pat_gh_kofi_a';
test('the owner-scoped source response assesses an uncited revision as insufficient', () => {
 const s = setup();
 try {
  const claim = readGraphSources(s.db, s.doctor, patient).claims.find(c => c.id === s.claim.id);
  assert.equal(claim?.assessment.status, 'insufficient');
  assert.equal(claim?.assessment.evidenceState, 'unverified');
  assert.deepEqual(claim?.assessment.flags, ['missing-support']);
 } finally {
  s.db.close();
 }
});
function setup(){const s=sourceScenario(),v=readGraphClaims(s.db,s.doctor,patient),claim=recordGraphClaim(s.db,s.doctor,{patient,commandKey:'ingest-first-claim',expectedVersion:0,type:'hypothesis',text:'SYNTHETIC: follow-up assessment requires clinician review.',sources:[],sourceHash:v.sourceHash}).claim;return {...s,claim};}
function document(s:ReturnType<typeof setup>,changes:Record<string,unknown>={}){return {patient,commandKey:'ingest-document-one',sourceHash:readGraphSources(s.db,s.doctor,patient).sourceHash,action:'document',title:'SYNTHETIC referral letter',content:'SYNTHETIC: community follow-up requested. Not a clinical conclusion.',effectiveAt:'2026-01-15T09:00:00Z',...changes} as GraphIngestionCommand;}
function link(s:ReturnType<typeof setup>,changes:Record<string,unknown>={}){const v=readGraphSources(s.db,s.doctor,patient),p=v.sources.find(p=>p.format==='timeline')!;return {patient,commandKey:'ingest-link-one',sourceHash:v.sourceHash,action:'link',claim:s.claim.id,expectedVersion:1,format:p.format,source:p.id,relationship:'supported',...changes} as GraphIngestionCommand;}
test('all relationship semantics persist immutably with exact timeline source and effective time',()=>{const s=setup(),v=readGraphSources(s.db,s.doctor,patient);for(const [i,relationship] of ['supported','contradicting','insufficient'].entries()){const p=v.sources.filter(p=>p.format==='timeline')[i];ingestGraphSource(s.db,s.doctor,link(s,{relationship,source:p.id,commandKey:'ingest-relationship-'+i}));}const edges=readGraphSources(s.db,s.doctor,patient).edges;assert.equal(edges.length,3);for(const e of edges){const inspected=readGraphSources(s.db,s.doctor,patient,e.id).inspection!;assert.equal(inspected.edge.source!.recordId,e.source!.recordId);assert.ok(inspected.exact);assert.equal(inspected.edge.evidenceState,'unverified');}const o=v.sources.find(p=>p.format==='timeline'&&p.effectiveAt?.includes('T'));assert.ok(o);assert.equal(readGraphClaims(s.db,s.doctor,patient).claims[0].evidenceState,'unverified');ingestGraphSource(s.db,s.doctor,document(s));for(const t of ['graph_documents','graph_source_edges','graph_ingestion_commands']){assert.throws(()=>s.db.exec('DELETE FROM '+t),/immutable/);}s.db.close();});
test('FHIR edges resolve real server-mapped R4 with version and underlying ledger provenance',()=>{const s=setup(),p=readGraphSources(s.db,s.doctor,patient).sources.find(p=>p.format==='fhir-r4')!;const result=ingestGraphSource(s.db,s.doctor,link(s,{format:p.format,source:p.id}));const inspection=readGraphSources(s.db,s.doctor,patient,result.result.id).inspection!;assert.equal(inspection.edge.source!.sha256,p.sha256);const exact=inspection.exact as {mappingVersion:string;resource:{resourceType:string;meta:{versionId:string}}};assert.ok(exact.mappingVersion);assert.ok(exact.resource.resourceType);assert.equal(String(exact.resource.meta.versionId),String(p.version));s.db.close();});
test('local documents retain exact plain text, server author, date and unknown effective time without chart writes',()=>{const s=setup(),before=get<{n:number}>(s.db,'SELECT COUNT(*) n FROM source_versions')!.n,d=ingestGraphSource(s.db,s.doctor,document(s,{effectiveAt:null,content:'SYNTHETIC <script>not executed</script>'}));const p=readGraphSources(s.db,s.doctor,patient).sources.find(p=>p.id===d.result.id)!;assert.equal(p.effectiveAt,null);assert.equal(p.timePrecision,'unknown');const e=ingestGraphSource(s.db,s.doctor,link(s,{source:p.id,format:p.format,relationship:'insufficient'}));const exact=readGraphSources(s.db,s.doctor,patient,e.result.id).inspection!.exact as {content:string;owner:string;version:number;synthetic:boolean};assert.equal(exact.content,'SYNTHETIC <script>not executed</script>');assert.equal(exact.owner,s.doctor.userId);assert.equal(exact.version,1);assert.equal(exact.synthetic,true);assert.equal(get<{n:number}>(s.db,'SELECT COUNT(*) n FROM source_versions')!.n,before);s.db.close();});
test('receipts normalize field ordering and prevent changed replay, duplicate edges and stale claim versions',()=>{const s=setup(),cmd=document(s),a=ingestGraphSource(s.db,s.doctor,cmd),b=ingestGraphSource(s.db,s.doctor,Object.fromEntries(Object.entries(cmd).reverse()) as GraphIngestionCommand);assert.equal(a.result.id,b.result.id);assert.equal(b.replayed,true);assert.throws(()=>ingestGraphSource(s.db,s.doctor,{...cmd,title:'Changed'} as GraphIngestionCommand));const l=link(s);ingestGraphSource(s.db,s.doctor,l);assert.throws(()=>ingestGraphSource(s.db,s.doctor,{...l,commandKey:'ingest-duplicate-edge'}));assert.throws(()=>ingestGraphSource(s.db,s.doctor,link(s,{expectedVersion:2})));s.db.close();});
test('strict input rejects actor/model/verified fields, unbounded text and false effective dates',()=>{const s=setup();for(const override of [{author:'other'},{model:'ai'},{evidenceState:'verified'},{content:'x'.repeat(8001)},{title:''},{effectiveAt:'2026-02-30T09:00:00Z'},{effectiveAt:undefined},{effectiveAt:'today'}])assert.throws(()=>ingestGraphSource(s.db,s.doctor,document(s,override)));for(const override of [{relationship:'verified'},{format:'http'},{source:'https://example.com'},{expectedVersion:0}])assert.throws(()=>ingestGraphSource(s.db,s.doctor,link(s,override)));assert.equal(get<{n:number}>(s.db,'SELECT COUNT(*) n FROM graph_documents')!.n,0);s.db.close();});
test('owner, patient, tenant, facility, purpose and revoked permission boundaries hide documents and links',()=>{const s=setup();ingestGraphSource(s.db,s.doctor,document(s));const e=ingestGraphSource(s.db,s.doctor,link(s)),nurse=readSession(s.db,openSession(s.db,DEMO_GH.users.nurse).sessionId)!;assert.equal(readGraphSources(s.db,nurse,patient).edges.length,0);assert.ok(!readGraphSources(s.db,nurse,patient).sources.some(p=>p.format==='local-document'));assert.throws(()=>readGraphSources(s.db,nurse,patient,e.result.id));assert.throws(()=>readGraphSources(s.db,s.doctor,'pat_gh_ama_serwaa',e.result.id));for(const ctx of [{...s.doctor,organizationId:'foreign'},{...s.doctor,facilityId:'foreign'},{...s.doctor,purposeOfUse:'OPERATIONS' as const}])assert.throws(()=>readGraphSources(s.db,ctx,patient,e.result.id));s.db.exec("DELETE FROM authorization_role_permissions WHERE permission_id='clinical.source.history.read'");assert.throws(()=>readGraphSources(s.db,s.doctor,patient));s.db.close();});
test('real observation correction withholds dependent edge and exact inspection fails closed',()=>{const s=setup(),p=readGraphSources(s.db,s.doctor,patient).sources.find(p=>p.format==='timeline'&&p.recordId===s.records.find(r=>r.type==='Observation')!.id)!;const e=ingestGraphSource(s.db,s.doctor,link(s,{source:p.id}));correctObservation(s.db,s.doctor,p.recordId,{expectedVersion:1,valueQuantity:37.9,reason:'entry-correction',idempotencyKey:'ingest-source-correction'});const edge=readGraphSources(s.db,s.doctor,patient).edges.find(v=>v.id===e.result.id)!;assert.equal(edge.source,null);assert.equal(edge.state,'changed-or-unavailable');const missing = {code:'notfound', message:'That record is not on this facility.'};
 assert.throws(() => readGraphSources(s.db,s.doctor,patient,e.result.id), missing);
 assert.throws(() => readGraphSources(s.db,s.doctor,patient,'egs_'+crypto.randomUUID()), missing);
 const denial = get<{n:number}>(s.db, "SELECT COUNT(*) n FROM audit_events WHERE action='evidence.ingestion.denied' AND outcome='denied' AND resource_id IS NULL");
 assert.equal(denial?.n, 2);
 const graph = readGraphClaims(s.db, s.doctor, patient);
 assert.equal(graph.claims.find(c => c.id === s.claim.id)?.text, null);
 assert.equal(graph.claims.find(c => c.id === s.claim.id)?.sourceState, 'changed-or-unavailable');
 assert.ok(readGraphSources(s.db,s.doctor,patient).claims.find(c => c.id === s.claim.id)?.assessment.flags.includes('stale-source'));
 const corrected = graph.sources.find(source => source.recordId === p.recordId)!;
 const replacement = recordGraphClaim(s.db,s.doctor,{
  patient, claim:s.claim.id, expectedVersion:1, commandKey:'ingest-reviewed-revision',
  type:'hypothesis', text:'SYNTHETIC reviewed source revision', sources:[corrected.id], sourceHash:graph.sourceHash,
 });
 assert.equal(replacement.claim.version, 2);
 assert.equal(replacement.claim.sourceState, 'current');
 assert.equal(readGraphClaims(s.db,s.doctor,patient,{claim:s.claim.id,revision:1}).claims[0]?.text, null);
 s.db.close();
});
test('new claim revision withholds prior revision edges, retaining immutable records',()=>{const s=setup(),e=ingestGraphSource(s.db,s.doctor,link(s)),v=readGraphClaims(s.db,s.doctor,patient);recordGraphClaim(s.db,s.doctor,{patient,commandKey:'ingest-new-claim-revision',claim:s.claim.id,expectedVersion:1,type:'hypothesis',text:'SYNTHETIC revised question.',sources:[],sourceHash:v.sourceHash});assert.equal(readGraphSources(s.db,s.doctor,patient).edges[0].source,null);assert.throws(()=>readGraphSources(s.db,s.doctor,patient,e.result.id));assert.equal(get<{n:number}>(s.db,'SELECT COUNT(*) n FROM graph_source_edges')!.n,1);s.db.close();});
test('dependency outage and corrupt document/edge lineage cannot return cached content',()=>{const s=setup();ingestGraphSource(s.db,s.doctor,document(s));ingestGraphSource(s.db,s.doctor,link(s));setSourceDependency(s.db,'unavailable');assert.throws(()=>readGraphSources(s.db,s.doctor,patient));setSourceDependency(s.db,'available');s.db.exec('DROP TRIGGER graph_documents_immutable_update');s.db.exec("UPDATE graph_documents SET content='corrupt'");assert.throws(()=>readGraphSources(s.db,s.doctor,patient),/integrity/);s.db.close();});
test('outbox failure rolls back data and receipt atomically, retry persists exactly once',()=>{const s=setup(),cmd=document(s);s.db.exec("CREATE TRIGGER ingestion_outage BEFORE INSERT ON outbox WHEN NEW.event_type='evidence.source.recorded' BEGIN SELECT RAISE(ABORT,'outage'); END;");assert.throws(()=>ingestGraphSource(s.db,s.doctor,cmd));assert.equal(get<{n:number}>(s.db,'SELECT COUNT(*) n FROM graph_documents')!.n,0);assert.equal(get<{n:number}>(s.db,'SELECT COUNT(*) n FROM graph_ingestion_commands')!.n,0);s.db.exec('DROP TRIGGER ingestion_outage');ingestGraphSource(s.db,s.doctor,cmd);assert.equal(get<{n:number}>(s.db,'SELECT COUNT(*) n FROM graph_documents')!.n,1);s.db.close();});
test('migration 58 partial failure rolls back and retry preserves claims through schema 63',()=>{const dir=mkdtempSync(join(tmpdir(),'cura-ingest-migrate-')),file=join(dir,'db.sqlite'),s=sourceScenario(file),v=readGraphClaims(s.db,s.doctor,patient);recordGraphClaim(s.db,s.doctor,{patient,commandKey:'migration-claim-one',expectedVersion:0,type:'hypothesis',text:'SYNTHETIC retained draft.',sources:[],sourceHash:v.sourceHash});s.db.exec(EVIDENCE_INGESTION_FIXTURE_ROLLBACK);s.db.exec('CREATE TABLE graph_source_edges(id TEXT)');s.db.close();assert.throws(()=>createDatabase(file));const {DatabaseSync}=sqlite;const raw=new DatabaseSync(file);assert.equal(get<{n:number}>(raw,"SELECT COUNT(*) n FROM sqlite_master WHERE name='graph_documents'")!.n,0);assert.equal(get<{v:number}>(raw,'SELECT MAX(version) v FROM schema_migrations')!.v,58);raw.exec('DROP TABLE graph_source_edges');raw.close();const db=createDatabase(file);assert.equal(get<{v:number}>(db,'SELECT MAX(version) v FROM schema_migrations')!.v,63);assert.equal(get<{n:number}>(db,'SELECT COUNT(*) n FROM graph_claims')!.n,1);db.close();});
import * as sqlite from 'node:sqlite';

test('actual processes serialize one document command and return one immutable receipt',async()=>{const dir=mkdtempSync(join(tmpdir(),'cura-ingest-race-')),file=join(dir,'db.sqlite'),ctxFile=join(dir,'ctx.json'),commandFile=join(dir,'cmd.json'),s=sourceScenario(file),v=readGraphSources(s.db,s.doctor,patient);writeFileSync(ctxFile,JSON.stringify(s.doctor));writeFileSync(commandFile,JSON.stringify({patient,commandKey:'ingest-concurrent-document',sourceHash:v.sourceHash,action:'document',title:'SYNTHETIC parallel referral',content:'SYNTHETIC reproducible referral.',effectiveAt:null}));s.db.close();const race=()=>new Promise<{result:{id:string};replayed:boolean}>((resolve,reject)=>{const child=spawn(process.execPath,['--import','tsx',fileURLToPath(new URL('./evidence-ingestion-racer.ts',import.meta.url)),file,ctxFile,commandFile],{windowsHide:true});let output='',error='';child.stdout.on('data',b=>output+=b);child.stderr.on('data',b=>error+=b);child.on('error',reject);child.on('exit',code=>code===0?resolve(JSON.parse(output)):reject(Error(error)));});const [a,b]=await Promise.all([race(),race()]);assert.equal(a.result.id,b.result.id);assert.notEqual(a.replayed,b.replayed);const db=createDatabase(file);assert.equal(get<{n:number}>(db,'SELECT COUNT(*) n FROM graph_documents')!.n,1);assert.equal(get<{n:number}>(db,'SELECT COUNT(*) n FROM graph_ingestion_commands')!.n,1);db.close();});
test('edge lineage tampering fails closed without exact source content',()=>{const s=setup();ingestGraphSource(s.db,s.doctor,link(s));s.db.exec('DROP TRIGGER graph_source_edges_immutable_update');s.db.exec("UPDATE graph_source_edges SET source_json='{}'");assert.throws(()=>readGraphSources(s.db,s.doctor,patient),/integrity/);s.db.close();});

test('a removed document withholds every dependent claim while unrelated claims remain readable', () => {
 const s = setup();
 try {
  const doc = ingestGraphSource(s.db,s.doctor,document(s));
  const graph = readGraphClaims(s.db,s.doctor,patient);
  const newClaim = (key:string) => recordGraphClaim(s.db,s.doctor,{
   patient,commandKey:key,expectedVersion:0,type:'hypothesis',
   text:'SYNTHETIC dependent draft',sources:[],sourceHash:graph.sourceHash,
  }).claim;
  const other = newClaim('shared-document-dependent');
  const unrelated = newClaim('unrelated-document-claim');
  for (const id of [s.claim.id, other.id]) {
   ingestGraphSource(s.db,s.doctor,link(s,{
    claim:id,commandKey:'link-'+id,source:doc.result.id,format:'local-document',
   }));
  }
  // Isolated fixture only. Model an authoritative deletion without exposing a delete command.
  s.db.exec('DROP TRIGGER graph_documents_immutable_delete');
  s.db.prepare('DELETE FROM graph_documents WHERE id=?').run(doc.result.id);
  const invalidated = readGraphClaims(s.db,s.doctor,patient);
  assert.notEqual(invalidated.sourceHash, graph.sourceHash);
  const claims = invalidated.claims;
  for (const id of [s.claim.id, other.id]) {
   const view = claims.find(claim => claim.id === id);
   assert.equal(view?.sourceState, 'changed-or-unavailable');
   assert.equal(view?.text, null);
  }
  assert.equal(claims.find(claim => claim.id === unrelated.id)?.text, 'SYNTHETIC dependent draft');
 } finally {
  s.db.close();
 }
});
