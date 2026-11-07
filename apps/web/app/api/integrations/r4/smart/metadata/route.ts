import { readSourceCapabilities } from "@curasphere/domain";
import { conformanceFailure,conformanceResponse } from "@/lib/conformance";
export async function GET(request:Request){try{return conformanceResponse(request,readSourceCapabilities(),true);}catch(error){return conformanceFailure(error,true);}}
