import { codingConformanceReport, getDb } from "@curasphere/domain";
import { terminologyCaller, terminologyFailure, terminologyJson } from "@/lib/terminology-registry";
export async function GET(){const ctx=await terminologyCaller();if(!ctx)return terminologyJson({error:"signin"},401);try{return terminologyJson({contractVersion:1,...codingConformanceReport(getDb(),ctx)});}catch(error){return terminologyFailure(error);}}
