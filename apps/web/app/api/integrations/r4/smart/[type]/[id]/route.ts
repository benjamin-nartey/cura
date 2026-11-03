import { getDb,readSmartResource,SmartError,smartTokenOrigin } from "@curasphere/domain";
import { smartFailure,smartJson,smartLiveSession,smartPreflight } from "@/lib/smart";
export const OPTIONS=smartPreflight;
export async function GET(request:Request,{params}:{params:Promise<{type:string;id:string}>}){let origin:string|null=null;try{
 const token=/^Bearer (sat_[A-Za-z0-9_-]{43})$/.exec(request.headers.get("authorization")??"")?.[1];if(!token)throw new SmartError("invalid_token",401);
 const candidate=request.headers.get("origin");if(candidate){if(candidate!==smartTokenOrigin(getDb(),token))throw new SmartError("invalid_token",401);origin=candidate;}
 const {type,id}=await params;if(new URL(request.url).search)throw new SmartError("invalid_request");
 return smartJson(readSmartResource(getDb(),await smartLiveSession(token),token,type,id),200,origin,true);
 }catch(error){return smartFailure(error,origin,true);}}
