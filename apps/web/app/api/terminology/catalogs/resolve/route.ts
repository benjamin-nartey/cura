import { getDb, resolveFacilityCatalog } from "@curasphere/domain";
import { terminologyCaller, terminologyFailure, terminologyJson } from "@/lib/terminology-registry";
export async function GET(request:Request){const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);try{return terminologyJson({contractVersion:1,...resolveFacilityCatalog(getDb(),ctx,new URL(request.url).searchParams.get("key")??"")});}catch(error){return terminologyFailure(error);}}
