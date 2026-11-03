"use client";
import { useRef, useState } from "react";
type Choice={type:string;id:string;label:string;version:number};
export function FhirSourcePreview({choices}:{choices:Choice[]}){
 const [choice,setChoice]=useState("0"),[resource,setResource]=useState(""),[result,setResult]=useState(""),[error,setError]=useState(""),[busy,setBusy]=useState(false);
 const active=useRef<AbortController|null>(null);
 async function run(compare=false){
  active.current?.abort();const controller=new AbortController();active.current=controller;setBusy(true);setError("");setResult("");
  try{const selected=choices[Number(choice)],response=await fetch(compare?"/api/integrations/r4/preview":`/api/integrations/r4/preview?type=${encodeURIComponent(selected.type)}&id=${encodeURIComponent(selected.id)}`,{method:compare?"POST":"GET",cache:"no-store",signal:controller.signal,...(compare?{headers:{"content-type":"application/json"},body:resource}:{})});
   const data=await response.json();if(!response.ok)throw new Error(`${response.status}: ${data.issue?.[0]?.diagnostics??"Preview unavailable. Retry."}`);
   if(compare)setResult(JSON.stringify(data,null,2));else setResource(JSON.stringify(data.resource,null,2));
  }catch(problem){if(!controller.signal.aborted)setError(problem instanceof Error?problem.message:"Network unavailable. Retry the preview.");}
  finally{if(active.current===controller){setBusy(false);active.current=null;}}
 }
 return <section className="card" aria-labelledby="source-preview-heading" style={{marginTop:24}}><h2 id="source-preview-heading">Source mapping preview</h2>
 {!choices.length?<p>No source records are available for this patient and role.</p>:<>
 <label htmlFor="source-record">Source record</label><select id="source-record" value={choice} onChange={event=>{active.current?.abort();active.current=null;setBusy(false);setChoice(event.target.value);setResource("");setResult("");setError("");}}>{choices.map((item,index)=><option key={`${item.type}/${item.id}`} value={index}>{item.type} · {item.label} · v{item.version} · {item.id}</option>)}</select>
 <div className="actions" style={{marginTop:16}}><button className="btn-dark" type="button" disabled={busy} onClick={()=>void run()}>Load R4 preview</button>{busy?<button className="btn-line" type="button" onClick={()=>{active.current?.abort();active.current=null;setBusy(false);setError("Preview cancelled. You can retry.");}}>Cancel preview</button>:null}</div>
 <p role="status" aria-live="polite">{busy?"Reading and checking source mapping…":resource?"Preview loaded. Compare the unchanged resource to verify its round trip, or edit supported fields to inspect proposed differences.":"Select a source record and load its current R4 representation."}</p>
 {error?<p role="alert">{error}</p>:null}
 <label htmlFor="r4-resource">FHIR R4 resource JSON</label><textarea id="r4-resource" spellCheck={false} rows={18} value={resource} maxLength={100000} onChange={event=>{setResource(event.target.value);setResult("");}} style={{width:"100%",fontFamily:"monospace",fontSize:"0.85rem"}}/>
 <button className="btn-dark" type="button" disabled={busy||!resource} onClick={()=>void run(true)}>Compare reverse mapping</button>
 {result?<section aria-label="Reverse mapping result" style={{marginTop:20}}><h3>Proposed source comparison</h3><p>No changes were applied and nothing was delivered externally.</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:"0.85rem"}}>{result}</pre></section>:null}</>}
 </section>;
}
