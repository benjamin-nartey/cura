import {getDb,readTwinInspection} from "@curasphere/domain";
import {timelineCaller} from "@/lib/timeline-query";
import {twinInspectionQuery} from "@/lib/twin-inspection-query";
import {sourceJson,sourceFailure} from "@/lib/fhir-source";
export async function GET(request:Request){try{const ctx=await timelineCaller(request),q=twinInspectionQuery(new URL(request.url).searchParams);return sourceJson(readTwinInspection(getDb(),ctx,q.patient,q.input));}catch(e){return sourceFailure(e);}}
