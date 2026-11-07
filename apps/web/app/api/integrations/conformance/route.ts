import { AppError,readConformanceCatalog } from "@curasphere/domain";
import { conformanceFailure,conformanceResponse } from "@/lib/conformance";
export async function GET(request:Request){try{if(new URL(request.url).search)throw new AppError("invalid","The conformance catalog accepts no query fields.");return conformanceResponse(request,readConformanceCatalog());}catch(error){return conformanceFailure(error);}}
