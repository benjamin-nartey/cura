import { getDb, reviewTerminologyMapping, type MappingReviewInput } from "@curasphere/domain";
import { terminologyBody, terminologyCaller, terminologyFailure, terminologyJson, terminologySameOrigin } from "@/lib/terminology-registry";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 if(!terminologySameOrigin(request))return terminologyJson({error:"forbidden"},403);const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);
 try{const {id}=await params;const input=await terminologyBody(request,["decision","expectedVersion","reason","idempotencyKey"]) as MappingReviewInput;return terminologyJson({contractVersion:1,...reviewTerminologyMapping(getDb(),ctx,id,input)});}catch(error){return terminologyFailure(error);}
}
