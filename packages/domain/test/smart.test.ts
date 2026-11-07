import assert from "node:assert/strict";
import test,{mock} from "node:test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";
import { sourceScenario } from "./fhir-source-fixtures.ts";
import { createDatabase,get } from "../src/db.ts";
import { beginSmartAuthorization,decideSmartAuthorization,disableSmartClient,exchangeSmartCode,listSmartGrants,readSmartResource,registerSmartClient,revokeSmartGrant,revokeSmartToken,smartAudience,smartChallenge,smartConfiguration,SmartError } from "../src/smart.ts";
import { previewSourceR4 } from "../src/fhir-source.ts";
import { sourceFhirId } from "../src/fhir-source-map.ts";
import { SMART_FIXTURE_ROLLBACK } from "../src/smart-schema.ts";
import { closeSession } from "../src/session.ts";
const verifier="v".repeat(64),scope="launch/patient patient/Patient.r patient/Observation.r",redirectUri="http://127.0.0.1:3000/interop/apps/callback";
function scenario(file=":memory:") {const s=sourceScenario(file),app=registerSmartClient(s.db,s.admin,{name:"Synthetic Care Viewer",redirectUri,scopes:scope,idempotencyKey:"smart-client-create-01"});return {...s,app};}
function request(s:ReturnType<typeof scenario>,scopeValue=scope){return beginSmartAuthorization(s.db,s.doctor,{response_type:"code",client_id:s.app.id,redirect_uri:redirectUri,aud:smartAudience(),scope:scopeValue,state:"browser-state-012345678901",code_challenge:smartChallenge(verifier),code_challenge_method:"S256"});}
function code(s:ReturnType<typeof scenario>,scopeValue=scope){const pending=request(s,scopeValue),url=new URL(decideSmartAuthorization(s.db,s.doctor,pending.id,pending.nonce,s.common.patientId,true));assert.equal(url.searchParams.get("state"),"browser-state-012345678901");return url.searchParams.get("code")!;}
function exchange(s:ReturnType<typeof scenario>,authorizationCode:string,proof=verifier){return exchangeSmartCode(s.db,s.doctor,{grant_type:"authorization_code",code:authorizationCode,redirect_uri:redirectUri,client_id:s.app.id,code_verifier:proof});}
test("SMART actual approval, PKCE exchange and patient read are persisted, scoped and credential-free",()=>{
 const s=scenario(),authorizationCode=code(s),token=exchange(s,authorizationCode);
 assert.equal(token.patient,sourceFhirId(s.doctor.organizationId,"Patient",s.common.patientId));assert.ok(token.expires_in<=300);
 const patient=readSmartResource(s.db,s.doctor,token.access_token,"Patient",token.patient);
 assert.equal(patient.resourceType,"Patient");assert.equal("extension" in patient,false);assert.equal(JSON.stringify(patient).includes(s.doctor.sessionId),false);
 const obs=s.records.find(r=>r.type==="Observation")!,resource=readSmartResource(s.db,s.doctor,token.access_token,"Observation",sourceFhirId(s.doctor.organizationId,"Observation",obs.id));assert.equal("extension" in resource,false);
 assert.equal(JSON.stringify(previewSourceR4(s.db,s.doctor,"Observation",obs.id)).includes(s.doctor.sessionId),false);
 const tokens=s.db.prepare("SELECT * FROM smart_tokens").all(),codes=s.db.prepare("SELECT * FROM smart_codes").all();assert.ok(!JSON.stringify([tokens,codes]).includes(token.access_token));assert.ok(!JSON.stringify([tokens,codes]).includes(authorizationCode));
 assert.equal(listSmartGrants(s.db,s.doctor).length,1);s.db.close();
});
test("insufficient resource scope denies before source lookup; another patient/tenant/session/purpose is inaccessible",()=>{
 const s=scenario(),token=exchange(s,code(s,"launch/patient patient/Patient.r"));
 assert.throws(()=>readSmartResource(s.db,s.doctor,token.access_token,"Observation",sourceFhirId(s.doctor.organizationId,"Observation",s.records.find(record=>record.type==="Observation")!.id)),(error:unknown)=>error instanceof SmartError&&error.code==="insufficient_scope");
 assert.throws(()=>readSmartResource(s.db,s.doctor,token.access_token,"Patient",sourceFhirId(s.doctor.organizationId,"Patient","pat_gh_kofi_b")));
 for(const ctx of [s.foreign,{...s.doctor,facilityId:"fac_gh_madina"},{...s.doctor,purposeOfUse:"OPERATIONS" as const},null])assert.throws(()=>readSmartResource(s.db,ctx,token.access_token,"Patient",token.patient));s.db.close();
});
test("wrong PKCE burns the code and replay revokes an already issued grant",()=>{
 const s=scenario(),bad=code(s);assert.throws(()=>exchange(s,bad,"x".repeat(64)));assert.throws(()=>exchange(s,bad));
 const fresh=code(s),token=exchange(s,fresh);assert.throws(()=>exchange(s,fresh));assert.throws(()=>readSmartResource(s.db,s.doctor,token.access_token,"Patient",token.patient));s.db.close();
});
test("authorization nonce, exact redirect/audience, scopes and expiry prevent forged grants",()=>{
 const s=scenario(),pending=request(s);assert.throws(()=>decideSmartAuthorization(s.db,s.doctor,pending.id,"wrong",s.common.patientId,true));assert.throws(()=>decideSmartAuthorization(s.db,s.foreign,pending.id,pending.nonce,s.common.patientId,true));
 const defaults={response_type:"code",client_id:s.app.id,redirect_uri:redirectUri,aud:smartAudience(),scope,state:"browser-state-012345678901",code_challenge:smartChallenge(verifier),code_challenge_method:"S256"};
 for(const patch of [{redirect_uri:"http://evil.example/callback"},{aud:"http://evil.example/fhir"},{scope:"launch/patient patient/*.r"},{scope:"launch/patient patient/Patient.cruds"},{code_challenge_method:"plain"},{scope:"launch/patient offline_access"}])assert.throws(()=>beginSmartAuthorization(s.db,s.doctor,{...defaults,...patch}));
 const denied=new URL(decideSmartAuthorization(s.db,s.doctor,pending.id,pending.nonce,"",false));assert.equal(denied.searchParams.get("error"),"access_denied");assert.equal(denied.searchParams.has("code"),false);assert.equal(get<{n:number}>(s.db,"SELECT COUNT(*) n FROM smart_grants")?.n,0);s.db.close();
});
test("token revocation, client disable, account suspension and session logout take effect immediately",()=>{
 for(const action of ["token","grant","client","user","session"]){const s=scenario(),token=exchange(s,code(s));
  if(action==="token")revokeSmartToken(s.db,s.app.id,token.access_token);
  if(action==="grant")revokeSmartGrant(s.db,s.doctor,listSmartGrants(s.db,s.doctor)[0].id);
  if(action==="client")disableSmartClient(s.db,s.admin,s.app.id,1);
  if(action==="user")s.db.prepare("UPDATE users SET account_status='suspended' WHERE id=?").run(s.doctor.userId);
  if(action==="session")closeSession(s.db,s.doctor.sessionId);
  assert.throws(()=>readSmartResource(s.db,s.doctor,token.access_token,"Patient",token.patient));s.db.close();}
});
test("codes and tokens expire; dependency outage denies and recovers without new access",()=>{
 const s=scenario(),stale=code(s);mock.timers.setTime(Date.now()+61000);assert.throws(()=>exchange(s,stale));
 const token=exchange(s,code(s));s.db.prepare("UPDATE smart_controls SET value='unavailable'").run();assert.throws(()=>readSmartResource(s.db,s.doctor,token.access_token,"Patient",token.patient));s.db.prepare("UPDATE smart_controls SET value='available'").run();assert.ok(readSmartResource(s.db,s.doctor,token.access_token,"Patient",token.patient));mock.timers.setTime(Date.now()+301000);assert.throws(()=>readSmartResource(s.db,s.doctor,token.access_token,"Patient",token.patient));s.db.close();
});
test("registration retries, tenant boundaries, immutable grant context and audit do not expose credentials",()=>{
 const s=scenario();assert.equal(registerSmartClient(s.db,s.admin,{name:"Synthetic Care Viewer",redirectUri,scopes:scope,idempotencyKey:"smart-client-create-01"}).id,s.app.id);assert.throws(()=>registerSmartClient(s.db,s.doctor,{name:"Denied viewer",redirectUri,scopes:scope,idempotencyKey:"smart-client-denied"}));
 assert.throws(()=>registerSmartClient(s.db,s.admin,{name:"Unsafe port viewer",redirectUri:"http://127.0.0.1:8091/callback",scopes:scope,idempotencyKey:"unsafe-cookie-port-client"}));
 assert.ok(registerSmartClient(s.db,s.admin,{name:"Isolated partner viewer",redirectUri:"http://partner.smart-client.localhost:8091/callback",scopes:scope,idempotencyKey:"isolated-cookie-client"}).id);
 assert.throws(()=>beginSmartAuthorization(s.db,s.foreign,{response_type:"code",client_id:s.app.id,redirect_uri:redirectUri,aud:smartAudience(),scope,state:"state-foreign-0123456789",code_challenge:smartChallenge(verifier),code_challenge_method:"S256"}));
 const token=exchange(s,code(s));assert.throws(()=>s.db.exec("UPDATE smart_grants SET patient_id='pat_gh_kofi_b'"),/immutable/);
 const audit=JSON.stringify(s.db.prepare("SELECT action,resource_id FROM audit_events WHERE action LIKE 'smart.%'").all());assert.ok(!audit.includes(token.access_token));assert.ok(!audit.includes(verifier));assert.ok(audit.includes("smart.token.issue"));s.db.close();
});
test("file-backed restart preserves grant and revocation; schema 49 migration failure rolls back atomically",()=>{
 const file=join(mkdtempSync(join(tmpdir(),"cura-smart-")),"store.sqlite"),s=scenario(file),token=exchange(s,code(s));s.db.close();let db=createDatabase(file);assert.ok(readSmartResource(db,s.doctor,token.access_token,"Patient",token.patient));revokeSmartToken(db,s.app.id,token.access_token);db.close();db=createDatabase(file);assert.throws(()=>readSmartResource(db,s.doctor,token.access_token,"Patient",token.patient));
 const patients=get<{n:number}>(db,"SELECT COUNT(*) n FROM patients")!.n;db.exec(SMART_FIXTURE_ROLLBACK);db.exec("CREATE TABLE smart_requests(unexpected TEXT)");db.close();assert.throws(()=>createDatabase(file),/already exists/);
 const raw=new DatabaseSync(file);assert.equal((raw.prepare("SELECT MAX(version) v FROM schema_migrations").get() as {v:number}).v,48);assert.equal(raw.prepare("SELECT name FROM sqlite_master WHERE name='smart_clients'").get(),undefined);raw.exec("DROP TABLE smart_requests");raw.close();db=createDatabase(file);assert.equal(get<{n:number}>(db,"SELECT COUNT(*) n FROM patients")!.n,patients);assert.equal(get<{v:number}>(db,"SELECT MAX(version) v FROM schema_migrations")!.v,63);assert.equal(smartConfiguration().scopes_supported.includes("offline_access"),false);db.close();
});
test("concurrent code exchanges create one token and replay revocation survives both processes",async()=>{
 const file=join(mkdtempSync(join(tmpdir(),"cura-smart-race-")),"store.sqlite"),s=scenario(file),authorizationCode=code(s);s.db.close();
 const race=()=>new Promise<string>((resolve,reject)=>{const child=spawn(process.execPath,["--import","tsx",fileURLToPath(new URL("./smart-racer.ts",import.meta.url)),file,s.doctor.sessionId,authorizationCode,s.app.id,verifier]);let output="";child.stdout.on("data",data=>output+=data);child.on("error",reject);child.on("close",status=>status===0?resolve(output):reject(new Error("SMART race worker failed")));});
 assert.deepEqual((await Promise.all([race(),race()])).sort(),["issued","rejected"]);const db=createDatabase(file);assert.equal(get<{n:number}>(db,"SELECT COUNT(*) n FROM smart_tokens")!.n,1);assert.ok(get<{revoked_at:number|null}>(db,"SELECT revoked_at FROM smart_grants")!.revoked_at);db.close();
});
