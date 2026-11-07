import { getDb,queryTimeline } from "@curasphere/domain";
import { timelineCaller,timelineParameters } from "@/lib/timeline-query";
import { sourceJson,sourceFailure } from "@/lib/fhir-source";
export async function GET(request:Request){try{const ctx=await timelineCaller(request),q=timelineParameters(request,"query");return sourceJson(queryTimeline(getDb(),ctx,q.patient,q.filters));}catch(e){return sourceFailure(e);}}
