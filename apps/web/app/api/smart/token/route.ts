import { exchangeSmartCode,getDb,SmartError } from "@curasphere/domain";
import { smartCors,smartFailure,smartForm,smartJson,smartLiveSession,smartPreflight } from "@/lib/smart";
export const OPTIONS=smartPreflight;
export async function POST(request:Request){let origin:string|null=null;try{
 if(request.headers.has("authorization"))throw new SmartError("invalid_client");
 const fields=await smartForm(request,["grant_type","code","client_id","redirect_uri","code_verifier"]),value=(key:string)=>fields.get(key)??"";
 origin=smartCors(request,value("client_id"));const code=value("code"),ctx=await smartLiveSession(code,true);
 return smartJson(exchangeSmartCode(getDb(),ctx,{grant_type:value("grant_type"),code,client_id:value("client_id"),redirect_uri:value("redirect_uri"),code_verifier:value("code_verifier")}),200,origin);
 }catch(error){return smartFailure(error,origin);}}
