import { AppError,getDb,checkTimelineSource } from "@curasphere/domain";
import { terminologyCaller } from "@/lib/terminology-registry";
import { sourceOrigin,sourceJson,sourceFailure } from "@/lib/fhir-source";
export async function GET(request:Request){try{if(!sourceOrigin(request))throw new AppError("forbidden","Use this workspace origin.");const ctx=await terminologyCaller();if(!ctx)throw new AppError("signin","Sign in to check source freshness.");const q=new URL(request.url).searchParams;if(q.size!==1||q.getAll("patient").length!==1)throw new AppError("invalid","Select one patient.");return sourceJson(checkTimelineSource(getDb(),ctx,q.get("patient")!));}catch(e){return sourceFailure(e);}}
