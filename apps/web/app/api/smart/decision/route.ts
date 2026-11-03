import { decideSmartAuthorization,getDb,SmartError,smartOrigin } from "@curasphere/domain";
import { optionalSession } from "@/lib/session";
import { sourceOrigin } from "@/lib/fhir-source";
import { smartFailure,smartForm } from "@/lib/smart";
export async function POST(request:Request){try{if(!sourceOrigin(request))throw new SmartError("invalid_request",403);const ctx=await optionalSession();if(!ctx)throw new SmartError("login_required",401);
 const form=await smartForm(request,["requestId","nonce","patientId","decision"]),decision=form.get("decision");if(decision!=="allow"&&decision!=="deny")throw new SmartError("invalid_request");
 const url=decideSmartAuthorization(getDb(),ctx,form.get("requestId")??"",form.get("nonce")??"",form.get("patientId")??"",decision==="allow");return new Response(null,{status:303,headers:{location:url,"cache-control":"no-store","referrer-policy":"no-referrer"}});
 }catch(error){if(error instanceof SmartError&&error.status===400&&request.headers.get("accept")?.includes("text/html"))return Response.redirect(`${smartOrigin()}/interop/apps?error=${encodeURIComponent("Authorization expired or changed. Start again from an active application.")}`,303);return smartFailure(error);}}
