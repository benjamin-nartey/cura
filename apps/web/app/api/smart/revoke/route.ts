import { getDb,revokeSmartToken } from "@curasphere/domain";
import { smartCors,smartFailure,smartForm,smartJson,smartPreflight } from "@/lib/smart";
export const OPTIONS=smartPreflight;
export async function POST(request:Request){let origin:string|null=null;try{const form=await smartForm(request,["client_id","token","token_type_hint"]);origin=smartCors(request,form.get("client_id")??"");revokeSmartToken(getDb(),form.get("client_id")??"",form.get("token")??"");return smartJson({},200,origin);}catch(error){return smartFailure(error,origin);}}
