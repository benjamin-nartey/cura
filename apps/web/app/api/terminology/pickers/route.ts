import { getClinicalCodeChoices, getDb } from "@curasphere/domain";
import { terminologyCaller, terminologyFailure, terminologyJson } from "@/lib/terminology-registry";
export async function GET(request:Request){const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);try{return terminologyJson({contractVersion:1,choices:getClinicalCodeChoices(getDb(),ctx,new URL(request.url).searchParams.get("kind")??"")});}catch(error){return terminologyFailure(error);}}
