import {AppError,commandGatewayLifecycle,getDb,readGatewayLifecycle} from "@curasphere/domain";
import {sourceBody,sourceFailure,sourceJson} from "@/lib/fhir-source";
import {timelineCaller} from "@/lib/timeline-query";

export async function GET(request: Request) {
  try {
    const ctx = await timelineCaller(request);
    const query = new URL(request.url).searchParams;
    if ([...query.keys()].some(key => key !== "facility") || query.getAll("facility").length !== 1) {
      throw new AppError("invalid","Select one facility.");
    }
    return sourceJson(readGatewayLifecycle(getDb(),ctx,query.get("facility")!));
  } catch (error) {
    return sourceFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const ctx = await timelineCaller(request);
    if (new URL(request.url).search || request.headers.get("content-type")?.split(";")[0].trim().toLowerCase() !== "application/json") {
      throw new AppError("invalid","Send a JSON lifecycle command.");
    }
    return sourceJson(commandGatewayLifecycle(getDb(),ctx,await sourceBody(request)));
  } catch (error) {
    return sourceFailure(error);
  }
}
