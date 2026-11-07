import { getDb, translateTerminologyMapping, type TranslationInput } from "@curasphere/domain";
import { terminologyBody, terminologyCaller, terminologyFailure, terminologyJson, terminologySameOrigin } from "@/lib/terminology-registry";
export async function POST(request:Request) {
 if(!terminologySameOrigin(request))return terminologyJson({error:"forbidden"},403);const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);
 try{const input=await terminologyBody(request,["source","targetSystem","targetVersion","mappingVersion"]) as TranslationInput;return terminologyJson({contractVersion:1,...translateTerminologyMapping(getDb(),ctx,input)});}catch(error){return terminologyFailure(error);}
}
