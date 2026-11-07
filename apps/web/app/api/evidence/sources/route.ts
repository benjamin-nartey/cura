import {AppError,getDb,readGraphSources,ingestGraphSource,noteDenial,type GraphIngestionCommand} from '@curasphere/domain';
import {timelineCaller} from '@/lib/timeline-query';
import {sourceJson,sourceFailure} from '@/lib/fhir-source';
type Caller=Awaited<ReturnType<typeof timelineCaller>>;
function fail(e:unknown,ctx:Caller|null,dispatched:boolean){if(ctx&&!dispatched){try{noteDenial(getDb(),ctx,'evidence.ingestion.invalid-request','EvidenceSource',null);}catch{return sourceFailure(new AppError('unavailable','Request audit is unavailable.'));}}return sourceFailure(e);}
export async function GET(request:Request){let ctx:Caller|null=null,dispatched=false;try{
 ctx=await timelineCaller(request);const q=new URL(request.url).searchParams;
 if(!q.has('patient')||[...q.keys()].some(k=>!['patient','edge','relationship'].includes(k)||q.getAll(k).length!==1))throw new AppError('invalid','Use the documented source query.');
 const relationship = q.get('relationship');
 if (relationship !== null && (q.has('edge') || !['supported','contradicting','insufficient'].includes(relationship))) {
  throw new AppError('invalid','Choose a documented evidence relationship filter.');
 }
 dispatched=true;
 const view = readGraphSources(getDb(),ctx,q.get('patient')!,q.has('edge')?q.get('edge')!:undefined);
 return sourceJson({
  ...view,
  edges: view.edges.filter(edge => edge.source && (relationship === null || edge.relationship === relationship)),
 });
}catch(e){return fail(e,ctx,dispatched);}}
export async function POST(request:Request){let ctx:Caller|null=null,dispatched=false;try{
 ctx=await timelineCaller(request);if(new URL(request.url).search||request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json'||!request.body)throw new AppError('invalid','Use bounded JSON.');
 const reader=request.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true});let raw='',size=0;
 try{while(true){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>40000){await reader.cancel();throw new AppError('invalid','Source command exceeds 40 KB.');}raw+=decoder.decode(p.value,{stream:true});}raw+=decoder.decode();}catch(e){if(e instanceof AppError)throw e;throw new AppError('invalid','Provide valid bounded UTF-8 JSON.');}
 let body;try{body=JSON.parse(raw);}catch{throw new AppError('invalid','Provide valid JSON.');}
 dispatched=true;return sourceJson(ingestGraphSource(getDb(),ctx,body as GraphIngestionCommand));
}catch(e){return fail(e,ctx,dispatched);}}
