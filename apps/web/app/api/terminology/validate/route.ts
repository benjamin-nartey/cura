import { getDb, validateControlledMembership, type MembershipInput } from "@curasphere/domain";
import { terminologyBody, terminologyCaller, terminologyFailure, terminologyJson, terminologySameOrigin } from "@/lib/terminology-registry";
export async function POST(request:Request) {
  if(!terminologySameOrigin(request))return terminologyJson({error:"forbidden"},403);
  const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);
  try{const input=await terminologyBody(request,["valueSetId","system","version","code"]) as MembershipInput;return terminologyJson({contractVersion:1,...validateControlledMembership(getDb(),ctx,input)});}catch(error){return terminologyFailure(error);}
}
