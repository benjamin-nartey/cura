import { AppError,getDb,receiveIntegrationMessage } from "@curasphere/domain";
import { integrationFailure,integrationJson,integrationRawBody } from "@/lib/integrations";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){try{
 if(request.headers.get("origin")||request.headers.get("cookie"))throw new AppError("forbidden","Use signed server-to-server transport without browser credentials.");
 if(new URL(request.url).search)throw new AppError("invalid","Message authentication belongs in headers.");
 const {id}=await params,body=await integrationRawBody(request);
 const result=receiveIntegrationMessage(getDb(),id,{messageId:request.headers.get("x-curasphere-message")??"",timestamp:request.headers.get("x-curasphere-timestamp")??"",signature:request.headers.get("x-curasphere-signature")??""},body);
 return integrationJson(result,result.duplicate?200:202);
 }catch(error){return integrationFailure(error);}}
