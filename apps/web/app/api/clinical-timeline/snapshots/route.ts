import { getDb,listTimelineSnapshots,captureTimelineSnapshot } from "@curasphere/domain";
import { timelineCaller,timelineParameters,snapshotCommand } from "@/lib/timeline-query";
import { sourceJson,sourceFailure } from "@/lib/fhir-source";
export async function GET(request:Request){try{const ctx=await timelineCaller(request),q=timelineParameters(request,"snapshots");return sourceJson(listTimelineSnapshots(getDb(),ctx,q.patient));}catch(e){return sourceFailure(e);}}
export async function POST(request:Request){try{const ctx=await timelineCaller(request),input=await snapshotCommand(request);return sourceJson(captureTimelineSnapshot(getDb(),ctx,input.patient,input.commandKey));}catch(e){return sourceFailure(e);}}
