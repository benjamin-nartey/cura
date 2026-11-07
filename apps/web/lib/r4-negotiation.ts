import { NextResponse } from "next/server";
const versions=new Set(["4.0","4.0.1"]);
export function r4Negotiation(request:Request,body=false,ndjson=false){
 const accept=request.headers.get("accept")??"*/*",content=request.headers.get("content-type")??"",format=new URL(request.url).searchParams.get("_format");
 const wrongVersion=(header:string)=>[...header.matchAll(/\bfhirVersion\s*=\s*"?([^;",\s]+)/gi)].some(m=>!versions.has(m[1]));
 const entries=accept.split(",").map(value=>{const [mime,...parameters]=value.trim().split(";");const q=parameters.find(p=>p.trim().startsWith("q="));return {mime:mime.toLowerCase(),q:q?Number(q.trim().slice(2)):1};});
 const exact=entries.filter(e=>e.mime===(ndjson?"application/fhir+ndjson":"application/fhir+json")),candidates=exact.length?exact:entries.filter(e=>["application/json","application/*","*/*",...(ndjson?["application/fhir+json"]:[])].includes(e.mime));
 const badAccept=wrongVersion(accept)||!candidates.some(e=>Number.isFinite(e.q)&&e.q>0&&e.q<=1)||format!==null&&!["json","application/json","application/fhir+json",...(ndjson?["application/fhir+ndjson"]:[])].includes(format);
 const badBody=body&&(wrongVersion(content)||!!content&&!["application/json","application/fhir+json"].includes(content.split(";")[0].trim().toLowerCase()));
 if(!badAccept&&!badBody)return null;
 return NextResponse.json({resourceType:"OperationOutcome",issue:[{severity:"error",code:"not-supported",diagnostics:"This interface serves FHIR R4 4.0.1 JSON only. No implicit R5/R4B or XML conversion is supported."}]},{status:badBody?415:406,headers:{"content-type":"application/fhir+json; fhirVersion=4.0","cache-control":"no-store","x-content-type-options":"nosniff"}});
}
