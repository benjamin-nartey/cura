import { getDb, listControlledValueSets, registerControlledValueSet, type ValueSetInput } from "@curasphere/domain";
import { terminologyBody, terminologyCaller, terminologyFailure, terminologyJson, terminologySameOrigin } from "@/lib/terminology-registry";
export async function GET() {
  const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);
  try{return terminologyJson({contractVersion:1,valueSets:listControlledValueSets(getDb(),ctx),limit:100});}catch(error){return terminologyFailure(error);}
}
export async function POST(request:Request) {
  if(!terminologySameOrigin(request))return terminologyJson({error:"forbidden"},403);
  const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);
  try{const input=await terminologyBody(request,["name","version","members","idempotencyKey"]) as ValueSetInput;const result=registerControlledValueSet(getDb(),ctx,input);return terminologyJson({contractVersion:1,...result},result.replayed?200:201);}catch(error){return terminologyFailure(error);}
}
