import {AppError,getDb,readGraphClaims,recordGraphClaim,noteDenial,type GraphClaimCommand} from "@curasphere/domain";
import {timelineCaller} from "@/lib/timeline-query";
import {sourceJson,sourceFailure} from "@/lib/fhir-source";

type Caller=Awaited<ReturnType<typeof timelineCaller>>;
function failure(error:unknown,ctx:Caller|null,dispatched:boolean){if(ctx&&!dispatched){try{noteDenial(getDb(),ctx,'evidence.graph.invalid-request','EvidenceClaim',null);}catch{return sourceFailure(new AppError('unavailable','Request audit is unavailable. Restore the service and retry.'));}}return sourceFailure(error);}
export async function GET(request:Request){
  let ctx:Caller|null=null,dispatched=false;
  try{
    ctx=await timelineCaller(request);const q=new URL(request.url).searchParams;
    if(!q.has('patient')||[...q.keys()].some(k=>!['patient','claim','revision','sourceQuery'].includes(k)||q.getAll(k).length!==1)||q.has('revision')&&(!q.has('claim')||!/^\d{1,3}$/.test(q.get('revision')!)))throw new AppError('invalid','Use the documented typed-claim query.');
    dispatched=true;return sourceJson(readGraphClaims(getDb(),ctx,q.get('patient')!,{...(q.has('claim')?{claim:q.get('claim')!}:{}),...(q.has('revision')?{revision:Number(q.get('revision'))}:{}),...(q.has('sourceQuery')?{sourceQuery:q.get('sourceQuery')!}:{})}));
  }catch(error){return failure(error,ctx,dispatched);}
}
export async function POST(request:Request){
  let ctx:Caller|null=null,dispatched=false;
  try{
    ctx=await timelineCaller(request);
    if(new URL(request.url).search||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!request.body)throw new AppError('invalid','Use a bounded JSON typed-claim command.');
    const reader=request.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let raw='',length=0;
    try{while(true){const part=await reader.read();if(part.done)break;length+=part.value.byteLength;if(length>16000){await reader.cancel();throw new AppError('invalid','The typed-claim command exceeds 16 KB.');}raw+=decoder.decode(part.value,{stream:true});}raw+=decoder.decode();}
    catch(error){if(error instanceof AppError)throw error;throw new AppError('invalid','Provide bounded UTF-8 JSON.');}
    let body;try{body=JSON.parse(raw);}catch{throw new AppError('invalid','Provide a JSON typed-claim command.');}
    dispatched=true;return sourceJson(recordGraphClaim(getDb(),ctx,body as GraphClaimCommand));
  }catch(error){return failure(error,ctx,dispatched);}
}
