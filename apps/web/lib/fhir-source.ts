import { AppError } from "@curasphere/domain";
import { NextResponse } from "next/server";
export function sourceJson(data:unknown,status=200){return NextResponse.json(data,{status,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}});}
export function sourceFailure(error:unknown){
  const known=error instanceof AppError;
  const code=known?error.code:"unavailable";
  const status=code==="signin"?401:code==="forbidden"?403:code==="notfound"?404:code==="conflict"?409:code==="invalid"||code==="code"||code==="range"?422:503;
  return sourceJson({resourceType:"OperationOutcome",issue:[{severity:"error",code:status===409?"conflict":status===503?"transient":status===403||status===401?"forbidden":"invalid",diagnostics:known?error.message:"The source preview is unavailable. Retry after restoring the dependency."}]},status);
}
export function sourceOrigin(request:Request){const origin=request.headers.get("origin");if(!origin)return request.headers.get("sec-fetch-site")!=="cross-site";try{return new URL(origin).host===request.headers.get("host");}catch{return false;}}
export async function sourceBody(request:Request){
  if(!request.headers.get("content-type")?.startsWith("application/json"))throw new AppError("invalid","Use a JSON R4 resource.");
  if(!request.body)throw new AppError("invalid","Provide an R4 resource.");
  const reader=request.body.getReader(),parts:Uint8Array[]=[];let length=0;
  while(true){const item=await reader.read();if(item.done)break;length+=item.value.byteLength;if(length>100000){await reader.cancel();throw new AppError("invalid","The R4 preview exceeds 100 KB.");}parts.push(item.value);}
  const bytes=new Uint8Array(length);let offset=0;for(const part of parts){bytes.set(part,offset);offset+=part.length;}
  try{return JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes));}catch{throw new AppError("invalid","The resource is not valid UTF-8 JSON.");}
}
