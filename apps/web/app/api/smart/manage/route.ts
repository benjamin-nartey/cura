import { AppError,disableSmartClient,getDb,registerSmartClient,revokeSmartGrant,SmartError,smartOrigin } from "@curasphere/domain";
import { optionalSession } from "@/lib/session";
import { sourceOrigin } from "@/lib/fhir-source";
import { smartFailure,smartForm } from "@/lib/smart";
export async function POST(request:Request){try{if(!sourceOrigin(request))throw new SmartError("invalid_request",403);const ctx=await optionalSession();if(!ctx)throw new SmartError("login_required",401);
 const form=await smartForm(request,["action","name","redirectUri","scopes","idempotencyKey","id","version"],["scopes"]),value=(key:string)=>form.get(key)??"";
 if(value("action")==="register")registerSmartClient(getDb(),ctx,{name:value("name"),redirectUri:value("redirectUri"),scopes:form.getAll("scopes").join(" "),idempotencyKey:value("idempotencyKey")});
 else if(value("action")==="disable")disableSmartClient(getDb(),ctx,value("id"),Number(value("version")));
 else if(value("action")==="revoke")revokeSmartGrant(getDb(),ctx,value("id"));else throw new SmartError("invalid_request");
 return Response.redirect(`${smartOrigin()}/interop/apps?notice=saved`,303);
 }catch(error){if(error instanceof AppError&&! (error instanceof SmartError))return Response.redirect(`${smartOrigin()}/interop/apps?error=${encodeURIComponent(error.message)}`,303);return smartFailure(error);}}
