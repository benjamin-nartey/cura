import { createHash,randomBytes,randomUUID,timingSafeEqual } from "node:crypto";
import { isSmartClientHost,type SessionContext } from "@curasphere/contracts";
import { all,get,run,transaction,type AppDatabase } from "./db";
import { AppError,ConflictError,ForbiddenError,NotFoundError,ValidationError } from "./errors";
import { assertLocalHealthcareSandbox } from "./experimental-healthcare";
import { authorize,effectivePermissions } from "./authorization";
import { writeAudit } from "./audit";
import { assertSourcePreviewAccess,previewSourceR4,readSourceR4ForPatient,sourceReadPermission } from "./fhir-source";
import { SOURCE_TYPES,sourceFhirId,sourceType,type SourceType } from "./fhir-source-map";

export class SmartError extends AppError {constructor(code:string,public status=400){super(code,`SMART request rejected: ${code}.`);}}
const hash=(value:string)=>createHash("sha256").update(value).digest("hex");
export const smartChallenge=(value:string)=>createHash("sha256").update(value).digest("base64url");
const secret=(prefix:string)=>prefix+randomBytes(32).toString("base64url");
const same=(a:string,b:string)=>a.length===b.length && timingSafeEqual(Buffer.from(a),Buffer.from(b));
export const SMART_SCOPES=["launch/patient",...SOURCE_TYPES.map(type=>`patient/${type}.r`)];
type Client={id:string;organization_id:string;name:string;redirect_uri:string;scopes:string;status:string;version:number;request_hash:string};
type RequestRow={id:string;client_id:string;client_version:number;organization_id:string;user_id:string;facility_id:string;session_id:string;purpose:string;redirect_uri:string;audience:string;scopes:string;state:string;challenge:string;nonce_hash:string;expires_at:number;status:string};
type Grant={id:string;client_id:string;client_version:number;organization_id:string;user_id:string;facility_id:string;session_id:string;purpose:string;patient_id:string;scopes:string;audience:string;created_at:number;expires_at:number;revoked_at:number|null};
export function smartOrigin(){
 const url=new URL(process.env.CURASPHERE_SMART_ORIGIN??"http://127.0.0.1:3000");
 if(!["localhost","127.0.0.1","[::1]"].includes(url.hostname)||!["http:","https:"].includes(url.protocol)||url.username||url.password||url.pathname!=="/"||url.search||url.hash)throw new SmartError("server_error",503);
 return url.origin;
}
export const smartAudience=()=>`${smartOrigin()}/api/integrations/r4/smart`;
function dependency(db:AppDatabase){assertLocalHealthcareSandbox();if(get<{value:string}>(db,"SELECT value FROM smart_controls WHERE name='dependency'")?.value!=="available")throw new SmartError("temporarily_unavailable",503);}
function audit(db:AppDatabase,ctx:SessionContext,action:string,id:string|null,outcome:"success"|"denied"="success"){writeAudit(db,ctx,{action:`smart.${action}`,resourceType:"SmartApp",resourceId:id,outcome});}
function actor(db:AppDatabase,ctx:SessionContext,manage=false){
 dependency(db);const user=get<{account_status:string;organization_id:string}>(db,"SELECT account_status,organization_id FROM users WHERE id=?",ctx.userId);
 if(!ctx.sessionId||!ctx.facilityId||user?.account_status!=="active"||user.organization_id!==ctx.organizationId)throw new ForbiddenError();
 const binding=get<{user_id:string;revoked_at:string|null;absolute_expires_at:string;idle_expires_at:string}>(db,"SELECT user_id,revoked_at,absolute_expires_at,idle_expires_at FROM auth_sessions WHERE session_id=?",ctx.sessionId);
 if(binding&&(binding.user_id!==ctx.userId||binding.revoked_at||Date.parse(binding.absolute_expires_at)<=Date.now()||Date.parse(binding.idle_expires_at)<=Date.now()))throw new SmartError("invalid_token",401);
 if(!ctx.sessionId.startsWith("ses_")){const session=get<{user_id:string;revoked_at:string|null;expires_at:string}>(db,"SELECT user_id,revoked_at,expires_at FROM sessions WHERE id=?",ctx.sessionId);if(!session||session.user_id!==ctx.userId||session.revoked_at||Date.parse(session.expires_at)<=Date.now())throw new SmartError("invalid_token",401);}
 const permission=manage?"organization.manage":"patient.read";
 const decision=authorize(db,{principalId:ctx.userId,accountActive:true},permission,{type:"SmartApp",organizationId:ctx.organizationId,facilityId:ctx.facilityId,sensitivity:"clinical"},{purpose:ctx.purposeOfUse,assurance:"directory",sessionActive:true,activeFacilityId:ctx.facilityId,correlationId:ctx.sessionId.replace(/[^A-Za-z0-9_-]/g,"").slice(0,80)});
 if(!decision.allow)throw new ForbiddenError();
 if(!manage&&ctx.purposeOfUse!=="TREATMENT")throw new ForbiddenError("forbidden","App grants require the existing treatment purpose.");
}
function scopes(input:string){
 if(typeof input!=="string"||input.length>500)throw new SmartError("invalid_scope");
 const values=input.trim().split(/\s+/);if(values.length<2||!values.includes("launch/patient")||values.some(value=>!SMART_SCOPES.includes(value))||new Set(values).size!==values.length)throw new SmartError("invalid_scope");
 return values.sort().join(" ");
}
function client(db:AppDatabase,id:string,org?:string){const row=get<Client>(db,"SELECT * FROM smart_clients WHERE id=?",id);if(!row||row.status!=="active"||(org&&row.organization_id!==org))throw new SmartError("invalid_client");try{redirect(row.redirect_uri);}catch{throw new SmartError("invalid_client");}return row;}
function redirect(value:string){let url:URL;try{url=new URL(value);}catch{throw new ValidationError();}
 const builtin=`${smartOrigin()}/interop/apps/callback`,isolated=isSmartClientHost(url.hostname)&&url.port!==new URL(smartOrigin()).port;
 if(!["http:","https:"].includes(url.protocol)||(!isolated&&value!==builtin)||url.username||url.password||url.hash||value.length>500||url.href!==value)throw new ValidationError("invalid","Use the built-in callback or an isolated client hostname under smart-client.localhost on a separate port.");return value;}
function eligibility(db:AppDatabase,ctx:SessionContext,scope:string){actor(db,ctx);const permissions=effectivePermissions(db,ctx.userId,ctx.organizationId,ctx.facilityId).permissions;for(const type of SOURCE_TYPES)if(scope.split(" ").includes(`patient/${type}.r`)&&!permissions.includes(sourceReadPermission(type)))throw new SmartError("invalid_scope");assertSourcePreviewAccess(db,ctx);}
export function registerSmartClient(db:AppDatabase,ctx:SessionContext,input:{name:string;redirectUri:string;scopes:string;idempotencyKey:string}){
 actor(db,ctx,true);const name=input.name.trim();if(name.length<3||name.length>100||!/^[-\w .]{3,100}$/.test(name)||!/^[A-Za-z0-9_-]{8,80}$/.test(input.idempotencyKey))throw new ValidationError();
 const uri=redirect(input.redirectUri),scope=scopes(input.scopes),requestHash=hash(JSON.stringify([name,uri,scope]));
 return transaction(db,()=>{const prior=get<Client>(db,"SELECT * FROM smart_clients WHERE organization_id=? AND registration_key=?",ctx.organizationId,input.idempotencyKey);if(prior){if(prior.request_hash!==requestHash)throw new ConflictError("conflict","The registration key was used with different fields.");return {id:prior.id,idempotent:true};}
  const id=`sca_${randomUUID()}`;run(db,"INSERT INTO smart_clients VALUES(?,?,?,?,?,'active',1,?,?,?,?)",id,ctx.organizationId,name,uri,scope,input.idempotencyKey,requestHash,ctx.userId,Date.now());audit(db,ctx,"client.register",id);return {id,idempotent:false};});
}
export function listSmartClients(db:AppDatabase,ctx:SessionContext){
 dependency(db);const manage=effectivePermissions(db,ctx.userId,ctx.organizationId,ctx.facilityId).permissions.includes("organization.manage");actor(db,ctx,manage);
 return all<{id:string;name:string;redirect_uri:string;scopes:string;status:string;version:number}>(db,"SELECT id,name,redirect_uri,scopes,status,version FROM smart_clients WHERE organization_id=? ORDER BY created_at DESC",ctx.organizationId).map(row=>({...row}));
}
export function disableSmartClient(db:AppDatabase,ctx:SessionContext,id:string,version:number){actor(db,ctx,true);return transaction(db,()=>{const row=get<Client>(db,"SELECT * FROM smart_clients WHERE id=? AND organization_id=?",id,ctx.organizationId);if(!row)throw new NotFoundError();if(row.status==="disabled")return;if(row.version!==version)throw new ConflictError("conflict","The app changed. Reload it.");run(db,"UPDATE smart_clients SET status='disabled',version=version+1 WHERE id=?",id);run(db,"UPDATE smart_grants SET revoked_at=? WHERE client_id=? AND revoked_at IS NULL",Date.now(),id);audit(db,ctx,"client.disable",id);});}
export type SmartAuthorization={response_type:string;client_id:string;redirect_uri:string;aud:string;scope:string;state:string;code_challenge:string;code_challenge_method:string};
export function beginSmartAuthorization(db:AppDatabase,ctx:SessionContext,input:SmartAuthorization){
 actor(db,ctx);const app=client(db,input.client_id,ctx.organizationId),scope=scopes(input.scope);
 if(input.response_type!=="code"||input.code_challenge_method!=="S256"||!/^[A-Za-z0-9_-]{43}$/.test(input.code_challenge)||typeof input.state!=="string"||input.state.length<16||input.state.length>512||input.redirect_uri!==app.redirect_uri||input.aud!==smartAudience())throw new SmartError("invalid_request");
 if(scope.split(" ").some(s=>!app.scopes.split(" ").includes(s)))throw new SmartError("invalid_scope");eligibility(db,ctx,scope);
 const pending=get<{n:number}>(db,"SELECT COUNT(*) n FROM smart_requests WHERE session_id=? AND status='pending' AND expires_at>?",ctx.sessionId,Date.now())!.n;if(pending>=50)throw new SmartError("temporarily_unavailable",503);
 const id=`sar_${randomUUID()}`,nonce=secret("sn_");
 run(db,"INSERT INTO smart_requests VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pending')",id,app.id,app.version,ctx.organizationId,ctx.userId,ctx.facilityId,ctx.sessionId,"TREATMENT",app.redirect_uri,smartAudience(),scope,input.state,input.code_challenge,hash(nonce),Date.now()+10*60*1000);
 audit(db,ctx,"authorize.request",app.id);return {id,nonce,appName:app.name,scopes:scope,redirectUri:app.redirect_uri};
}
function matches(ctx:SessionContext,grant:Pick<Grant,"user_id"|"session_id"|"organization_id"|"facility_id"|"purpose">){return ctx.userId===grant.user_id&&ctx.sessionId===grant.session_id&&ctx.organizationId===grant.organization_id&&ctx.facilityId===grant.facility_id&&ctx.purposeOfUse===grant.purpose;}
export function decideSmartAuthorization(db:AppDatabase,ctx:SessionContext,id:string,nonce:string,patientId:string,allow:boolean){
 actor(db,ctx);return transaction(db,()=>{const request=get<RequestRow>(db,"SELECT * FROM smart_requests WHERE id=?",id);if(!request||!matches(ctx,request)||request.status!=="pending"||request.expires_at<=Date.now()||request.audience!==smartAudience()||!same(hash(nonce),request.nonce_hash))throw new SmartError("invalid_request");
  const app=client(db,request.client_id,ctx.organizationId);if(app.version!==request.client_version)throw new SmartError("invalid_client");
  const destination=new URL(request.redirect_uri);destination.searchParams.set("state",request.state);
  if(!allow){run(db,"UPDATE smart_requests SET status='denied' WHERE id=?",id);audit(db,ctx,"authorize.deny",app.id,"denied");destination.searchParams.set("error","access_denied");return destination.href;}
  eligibility(db,ctx,request.scopes);previewSourceR4(db,ctx,"Patient",patientId);
  const grantId=`sag_${randomUUID()}`,code=secret("sc_");run(db,"UPDATE smart_requests SET status='allowed' WHERE id=?",id);
  run(db,"INSERT INTO smart_grants VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,NULL)",grantId,id,app.id,app.version,ctx.organizationId,ctx.userId,ctx.facilityId,ctx.sessionId,ctx.purposeOfUse,patientId,request.scopes,request.audience,Date.now(),Date.now()+5*60*1000);
  run(db,"INSERT INTO smart_codes VALUES(?,?,?,?,?,?,NULL)",hash(code),grantId,request.challenge,request.redirect_uri,app.id,Date.now()+60*1000);
  audit(db,ctx,"authorize.allow",app.id);destination.searchParams.set("code",code);return destination.href;
 });
}
function validGrant(db:AppDatabase,grant:Grant|undefined,ctx:SessionContext|null):Grant{
 dependency(db);if(!grant||grant.revoked_at!==null||grant.expires_at<=Date.now()||grant.audience!==smartAudience()||!ctx||!matches(ctx,grant))throw new SmartError("invalid_token",401);
 let app:Client;try{app=client(db,grant.client_id,grant.organization_id);}catch{throw new SmartError("invalid_token",401);}if(app.version!==grant.client_version)throw new SmartError("invalid_token",401);actor(db,ctx);return grant;
}
export function smartSessionForSecret(db:AppDatabase,value:string,code=false){dependency(db);if(!(code?/^sc_[A-Za-z0-9_-]{43}$/:/^sat_[A-Za-z0-9_-]{43}$/).test(value))return null;return get<{session_id:string}>(db,`SELECT g.session_id FROM ${code?"smart_codes":"smart_tokens"} t JOIN smart_grants g ON g.id=t.grant_id WHERE t.hash=?`,hash(value))?.session_id??null;}
export function exchangeSmartCode(db:AppDatabase,ctx:SessionContext|null,input:{grant_type:string;code:string;redirect_uri:string;client_id:string;code_verifier:string}){
 dependency(db);if(input.grant_type!=="authorization_code"||!/^sc_[A-Za-z0-9_-]{43}$/.test(input.code)||!/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier))throw new SmartError("invalid_request");
 const result=transaction(db,()=>{const row=get<{grant_id:string;challenge:string;redirect_uri:string;client_id:string;expires_at:number;used_at:number|null}>(db,"SELECT * FROM smart_codes WHERE hash=?",hash(input.code));if(!row)return null;
  const grant=get<Grant>(db,"SELECT * FROM smart_grants WHERE id=?",row.grant_id);
  if(row.used_at!==null||row.expires_at<=Date.now()||row.client_id!==input.client_id||row.redirect_uri!==input.redirect_uri||!same(row.challenge,smartChallenge(input.code_verifier))){run(db,"UPDATE smart_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL",Date.now(),row.grant_id);run(db,"UPDATE smart_codes SET used_at=COALESCE(used_at,?) WHERE hash=?",Date.now(),hash(input.code));if(ctx&&grant&&matches(ctx,grant))audit(db,ctx,"token.reject",grant.client_id,"denied");return null;}
  try{validGrant(db,grant,ctx);}catch{return null;}
  const token=secret("sat_");run(db,"UPDATE smart_codes SET used_at=? WHERE hash=? AND used_at IS NULL",Date.now(),hash(input.code));run(db,"INSERT INTO smart_tokens VALUES(?,?,?,NULL)",hash(token),row.grant_id,grant!.expires_at);audit(db,ctx!,"token.issue",grant!.client_id);
  return {access_token:token,token_type:"Bearer",expires_in:Math.max(1,Math.floor((grant!.expires_at-Date.now())/1000)),scope:grant!.scopes,patient:sourceFhirId(grant!.organization_id,"Patient",grant!.patient_id)};
 });if(!result)throw new SmartError("invalid_grant");return result;
}
export function smartClientOrigin(db:AppDatabase,clientId:string){dependency(db);try{return new URL(client(db,clientId).redirect_uri).origin;}catch{return null;}}
export function isSmartOrigin(db:AppDatabase,origin:string){dependency(db);return all<{redirect_uri:string}>(db,"SELECT redirect_uri FROM smart_clients WHERE status='active'").some(c=>new URL(c.redirect_uri).origin===origin);}
export function smartTokenOrigin(db:AppDatabase,token:string){dependency(db);const row=get<{redirect_uri:string}>(db,"SELECT c.redirect_uri FROM smart_tokens t JOIN smart_grants g ON g.id=t.grant_id JOIN smart_clients c ON c.id=g.client_id WHERE t.hash=? AND c.status='active'",hash(token));return row?new URL(row.redirect_uri).origin:null;}
export function readSmartResource(db:AppDatabase,ctx:SessionContext|null,token:string,typeValue:string,id:string){
 dependency(db);const type=sourceType(typeValue),row=get<{grant_id:string;expires_at:number;revoked_at:number|null}>(db,"SELECT * FROM smart_tokens WHERE hash=?",hash(token));
 if(!row||row.revoked_at!==null||row.expires_at<=Date.now())throw new SmartError("invalid_token",401);
 const grant=validGrant(db,get<Grant>(db,"SELECT * FROM smart_grants WHERE id=?",row.grant_id),ctx);
 if(!grant.scopes.split(" ").includes(`patient/${type}.r`)){audit(db,ctx!,"resource.scope-denied",grant.client_id,"denied");throw new SmartError("insufficient_scope",403);}
 try{const source=readSourceR4ForPatient(db,ctx!,type,grant.patient_id,id);
  const patientKey=sourceFhirId(grant.organization_id,"Patient",grant.patient_id),subject=source[type==="AllergyIntolerance"?"patient":"subject"] as {reference?:string}|undefined;
  if(type==="Patient"?source.id!==patientKey:subject?.reference!==`Patient/${patientKey}`)throw new NotFoundError();
  const resource:Record<string,unknown>={...source,meta:{versionId:(source.meta as {versionId:string}).versionId}};delete resource.extension;
  audit(db,ctx!,"resource.read",grant.client_id);return resource;
 }catch(error){audit(db,ctx!,"resource.deny",grant.client_id,"denied");throw error;}
}
export function revokeSmartToken(db:AppDatabase,clientId:string,token:string){dependency(db);transaction(db,()=>{
 const grant=get<Grant>(db,"SELECT g.* FROM smart_tokens t JOIN smart_grants g ON g.id=t.grant_id WHERE t.hash=? AND g.client_id=?",hash(token),clientId);if(!grant)return;
 run(db,"UPDATE smart_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL",Date.now(),grant.id);
 const user=get<{role:SessionContext["role"];display_name:string}>(db,"SELECT role,display_name FROM users WHERE id=?",grant.user_id);
 if(user)audit(db,{sessionId:grant.session_id,userId:grant.user_id,organizationId:grant.organization_id,organizationName:"",facilityId:grant.facility_id,facilityName:"",displayName:user.display_name,role:user.role,purposeOfUse:"TREATMENT"},"token.revoke",grant.client_id);
});}
export function listSmartGrants(db:AppDatabase,ctx:SessionContext){const admin=effectivePermissions(db,ctx.userId,ctx.organizationId,ctx.facilityId).permissions.includes("organization.manage");actor(db,ctx,admin);return all<{id:string;name:string;scopes:string;created_at:number;expires_at:number;revoked_at:number|null}>(db,`SELECT g.id,c.name,g.scopes,g.created_at,g.expires_at,g.revoked_at FROM smart_grants g JOIN smart_clients c ON c.id=g.client_id WHERE g.organization_id=? ${admin?"":"AND g.user_id=?"} ORDER BY g.created_at DESC LIMIT 100`,ctx.organizationId,...(admin?[]:[ctx.userId]));}
export function revokeSmartGrant(db:AppDatabase,ctx:SessionContext,id:string){const admin=effectivePermissions(db,ctx.userId,ctx.organizationId,ctx.facilityId).permissions.includes("organization.manage");actor(db,ctx,admin);const grant=get<Grant>(db,"SELECT * FROM smart_grants WHERE id=? AND organization_id=?",id,ctx.organizationId);if(!grant||(!admin&&grant.user_id!==ctx.userId))throw new NotFoundError();transaction(db,()=>{run(db,"UPDATE smart_grants SET revoked_at=? WHERE id=? AND revoked_at IS NULL",Date.now(),id);audit(db,ctx,"grant.revoke",grant.client_id);});}
export function smartConfiguration(){assertLocalHealthcareSandbox();return {issuer:smartOrigin(),authorization_endpoint:`${smartOrigin()}/interop/apps/authorize`,token_endpoint:`${smartOrigin()}/api/smart/token`,revocation_endpoint:`${smartOrigin()}/api/smart/revoke`,grant_types_supported:["authorization_code"],response_types_supported:["code"],token_endpoint_auth_methods_supported:["none"],code_challenge_methods_supported:["S256"],scopes_supported:SMART_SCOPES,capabilities:["launch-standalone","client-public","context-standalone-patient","permission-patient","permission-v2"],simulation_notice:"Local read-only SMART-style subset; no search, refresh, OIDC identity, EHR launch, external sharing, or production certification."};}
