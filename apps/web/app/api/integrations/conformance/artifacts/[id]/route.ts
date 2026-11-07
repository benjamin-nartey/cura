import { AppError,readConformanceArtifact } from "@curasphere/domain";
import { conformanceFailure,conformanceResponse } from "@/lib/conformance";
export async function GET(request:Request,{params}:{params:Promise<{id:string}>}){try{if(new URL(request.url).search)throw new AppError("invalid","Artifact downloads accept no query fields.");return conformanceResponse(request,readConformanceArtifact((await params).id),true);}catch(error){return conformanceFailure(error,true);}}
