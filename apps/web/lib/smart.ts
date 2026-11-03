import { AppError,getDb,isSmartOrigin,readSession,SmartError,smartClientOrigin,smartConfiguration,smartSessionForSecret } from "@curasphere/domain";
import { readFoundationSession } from "./foundation";
import { NextResponse } from "next/server";
export function smartJson(data:unknown,status=200,origin?:string|null,fhir=false){return NextResponse.json(data,{status,headers:{"cache-control":"no-store","pragma":"no-cache","x-content-type-options":"nosniff","referrer-policy":"no-referrer",...(fhir?{"content-type":"application/fhir+json"}:{}),...(origin?{"access-control-allow-origin":origin,"vary":"Origin"}:{})}});}
export function smartFailure(error:unknown,origin?:string|null,fhir=false){
 const code=error instanceof SmartError?error.code:error instanceof AppError?error.code:"temporarily_unavailable";
 const status=error instanceof SmartError?error.status:code==="forbidden"?403:code==="notfound"?404:code==="conflict"?409:code==="invalid"?422:503;
 const response=smartJson(fhir?{resourceType:"OperationOutcome",issue:[{severity:"error",code:status===404?"not-found":status===401||status===403?"forbidden":"processing",diagnostics:`SMART read rejected: ${code}.`}]}:{error:code},status,origin,fhir);
 if(fhir&&(status===401||status===403))response.headers.set("www-authenticate",`Bearer error="${status===401?"invalid_token":"insufficient_scope"}"`);return response;
}
export async function smartLiveSession(value:string,code=false){const id=smartSessionForSecret(getDb(),value,code);if(!id)return null;return id.startsWith("ses_")?await readFoundationSession(id):readSession(getDb(),id);}
export async function smartForm(request:Request,allowed:string[],multiple:string[]=[]){
 if(request.headers.get("content-type")?.split(";")[0]!=="application/x-www-form-urlencoded"||!request.body)throw new SmartError("invalid_request");
 const reader=request.body.getReader(),chunks:Uint8Array[]=[];let length=0;
 while(true){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>8192){await reader.cancel();throw new SmartError("invalid_request");}chunks.push(item.value);}
 const bytes=new Uint8Array(length);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.length;}
 let text:string;try{text=new TextDecoder("utf-8",{fatal:true}).decode(bytes);}catch{throw new SmartError("invalid_request");}
 const fields=new URLSearchParams(text);for(const key of fields.keys())if(!allowed.includes(key)||(!multiple.includes(key)&&fields.getAll(key).length!==1))throw new SmartError("invalid_request");return fields;
}
export function smartCors(request:Request,clientId?:string){const origin=request.headers.get("origin");if(!origin)return null;const allowed=clientId?smartClientOrigin(getDb(),clientId)===origin:isSmartOrigin(getDb(),origin);if(!allowed)throw new SmartError("invalid_request",403);return origin;}
export function smartPreflight(request:Request){try{const origin=smartCors(request);if(!origin)throw new SmartError("invalid_request",403);return new Response(null,{status:204,headers:{"access-control-allow-origin":origin,"access-control-allow-methods":"GET, POST, OPTIONS","access-control-allow-headers":"Authorization, Content-Type","vary":"Origin","cache-control":"no-store"}});}catch(error){return smartFailure(error);}}
export function smartDiscovery(){try{return smartJson(smartConfiguration(),200,"*");}catch(error){return smartFailure(error);}}
