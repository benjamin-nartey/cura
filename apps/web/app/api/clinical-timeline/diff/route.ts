import { getDb,diffTimeline } from "@curasphere/domain";
import { timelineCaller,timelineParameters } from "@/lib/timeline-query";
import { sourceJson,sourceFailure } from "@/lib/fhir-source";
export async function GET(request:Request){try{const ctx=await timelineCaller(request),q=timelineParameters(request,"diff");return sourceJson(diffTimeline(getDb(),ctx,q.patient,q.baseline,q.filters));}catch(e){return sourceFailure(e);}}
