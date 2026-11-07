import { AppError, getDb, listSourceR4, previewSourceR4, reverseSourceR4 } from "@curasphere/domain";
import { terminologyCaller } from "@/lib/terminology-registry";
import { sourceBody, sourceFailure, sourceJson, sourceOrigin } from "@/lib/fhir-source";
export async function GET(request:Request){
  if(!sourceOrigin(request))return sourceFailure(new AppError("forbidden","Use the same workspace origin."));
  try{const ctx=await terminologyCaller();if(!ctx)return sourceFailure(new AppError("signin","Sign in to preview source records."));
    const query=new URL(request.url).searchParams;
    if([...query.keys()].some(key=>!["patient","type","id"].includes(key)) || [...query.keys()].some(key=>query.getAll(key).length!==1))throw new AppError("invalid","Use patient, or type and id.");
    if(query.has("patient") && query.size===1)return sourceJson(listSourceR4(getDb(),ctx,query.get("patient")!));
    if(query.size!==2||!query.has("type")||!query.has("id"))throw new AppError("invalid","Select the resource type and source ID.");
    return sourceJson(previewSourceR4(getDb(),ctx,query.get("type")!,query.get("id")!));
  }catch(error){return sourceFailure(error);}
}
export async function POST(request:Request){
  if(!sourceOrigin(request))return sourceFailure(new AppError("forbidden","Use the same workspace origin."));
  try{const ctx=await terminologyCaller();if(!ctx)return sourceFailure(new AppError("signin","Sign in to compare source records."));
    return sourceJson(reverseSourceR4(getDb(),ctx,await sourceBody(request)));}catch(error){return sourceFailure(error);}
}
