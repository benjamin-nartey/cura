import { getDb, listTerminologyMappings, proposeTerminologyMapping, type MappingInput } from "@curasphere/domain";
import { terminologyBody, terminologyCaller, terminologyFailure, terminologyJson, terminologySameOrigin } from "@/lib/terminology-registry";
export async function GET(request:Request) {
 const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);
 try{return terminologyJson({contractVersion:1,mappings:listTerminologyMappings(getDb(),ctx,new URL(request.url).searchParams.get("view")??"review"),limit:100});}catch(error){return terminologyFailure(error);}
}
export async function POST(request:Request) {
 if(!terminologySameOrigin(request))return terminologyJson({error:"forbidden"},403);const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);
 try{const input=await terminologyBody(request,["source","target","mappingVersion","equivalence","activeFrom","activeTo","sourceUrl","rationale","idempotencyKey"]) as MappingInput;const result=proposeTerminologyMapping(getDb(),ctx,input);return terminologyJson({contractVersion:1,...result},result.replayed?200:201);}catch(error){return terminologyFailure(error);}
}
