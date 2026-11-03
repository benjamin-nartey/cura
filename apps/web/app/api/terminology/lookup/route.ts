import { getDb, lookupControlledConcept } from "@curasphere/domain";
import { terminologyCaller, terminologyFailure, terminologyJson } from "@/lib/terminology-registry";
export async function GET(request: Request) {
 const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);
 const query=new URL(request.url).searchParams;
 try{return terminologyJson({contractVersion:1,concept:lookupControlledConcept(getDb(),ctx,query.get("system")??"",query.get("version")??"",query.get("code")??"")});}catch(error){return terminologyFailure(error);}
}
