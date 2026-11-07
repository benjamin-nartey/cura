import {AppError,getDb,readGroundedCopilotSummary} from "@curasphere/domain";
import {sourceFailure,sourceJson,sourceOrigin} from "@/lib/fhir-source";
import {terminologyCaller} from "@/lib/terminology-registry";

export async function GET(request:Request) {
  try {
    if (!sourceOrigin(request)) throw new AppError("forbidden","Use this workspace origin.");
    const ctx = await terminologyCaller();
    if (!ctx) throw new AppError("signin","Sign in to view a grounded summary.");
    const query = new URL(request.url).searchParams;
    if (query.size !== 1 || !query.has("patient")) throw new AppError("invalid","Select one patient.");
    return sourceJson(readGroundedCopilotSummary(getDb(),ctx,query.get("patient")!));
  } catch (error) {
    return sourceFailure(error);
  }
}
