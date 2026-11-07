'use client';
import {useCallback,useEffect,useId,useRef,useState} from 'react';
import type {readGraphSources,GraphRelationship,GraphSourceFormat} from '@curasphere/domain';
import {timelineTime} from '@/lib/timeline-presentation';
import styles from './evidence-sources.module.css';
type View=ReturnType<typeof readGraphSources>;
const evidenceFlags = {
 'stale-source': 'A linked source changed or is unavailable',
 contradiction: 'A source is annotated as contradicting',
 'insufficient-annotation': 'A source is annotated as insufficient',
 'unknown-effective-time': 'A supporting source has an unknown effective time',
 'missing-support': 'More distinct dated supporting records are needed',
};
const endpoint='/api/evidence/sources';

function EvidenceDrawer({inspection, onClose, trigger}: {
 inspection: NonNullable<View['inspection']>;
 onClose: () => void;
 trigger: HTMLButtonElement | null;
}) {
 const dialog = useRef<HTMLDialogElement>(null);
 const heading = useRef<HTMLHeadingElement>(null);
 const headingId = useId();
 const source = inspection.edge.source!;
 useEffect(() => {
  const node = dialog.current;
  if (!node) return;
  node.showModal();
  heading.current?.focus();
  return () => {
   node.close();
   if (trigger?.isConnected && !trigger.disabled) trigger.focus();
  };
 }, [trigger]);

 return <dialog ref={dialog} className={styles.drawer} aria-labelledby={headingId}
  onCancel={event => {event.preventDefault(); onClose();}}>
  <header className={styles.drawerHeader}>
   <h2 id={headingId} ref={heading} tabIndex={-1}>Evidence citation</h2>
   <button className="btn-line" onClick={onClose}>Close exact evidence</button>
  </header>
  <section role="region" aria-label="Exact linked evidence">
   <p>Claim {inspection.edge.claimId} · Revision {inspection.claim.version} · Unverified</p>
   <p>{inspection.claim.text}</p>
   <p>Relationship {inspection.edge.relationship}</p>
   <p>{source.label} · {source.format}</p>
   <p>Record {source.recordId} · version {source.version} · effective {source.effectiveAt ?? 'Unknown'}</p>
   <p>Source checksum {source.sha256}</p>
   <pre className={styles.json} tabIndex={0} aria-label="Exact source JSON">{JSON.stringify(inspection.exact,null,2)}</pre>
  </section>
 </dialog>;
}

export function EvidenceSources({patient}:{patient:string}){
 const [data,setData]=useState<View|null>(null),[inspection,setInspection]=useState<View['inspection']>(null),[busy,setBusy]=useState(false),[message,setMessage]=useState(''),[error,setError]=useState(''),[title,setTitle]=useState(''),[content,setContent]=useState(''),[effective,setEffective]=useState(''),[claim,setClaim]=useState(''),[source,setSource]=useState(''),[relation,setRelation]=useState<GraphRelationship>('insufficient');
 const generation=useRef(0),alive=useRef(false),controller=useRef<AbortController|null>(null),locked=useRef(false),current=useRef<View|null>(null);
 const [relationshipFilter, setRelationshipFilter] = useState('');
 const [claimFilter, setClaimFilter] = useState('');
 const inspectionTrigger = useRef<HTMLButtonElement|null>(null);
 const visibleEdges = data?.edges.filter(edge =>
  edge.source && (!relationshipFilter || edge.relationship === relationshipFilter)
  && (!claimFilter || edge.claimId === claimFilter)) ?? [];
 const clear=useCallback(()=>{generation.current++;controller.current?.abort();locked.current=false;current.current=null;setData(null);setInspection(null);setBusy(false);setTitle('');setContent('');setEffective('');setClaim('');setSource('');setRelation('insufficient');setMessage('');setError('');},[]);
 const load=useCallback(async()=>{
  if(!navigator.onLine||locked.current)return;locked.current=true;const g=++generation.current,c=new AbortController();controller.current?.abort();controller.current=c;setBusy(true);setError('');setInspection(null);
  try{const r=await fetch(endpoint+'?'+new URLSearchParams({patient}),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error();const value:View=await r.json();if(!alive.current||g!==generation.current||c.signal.aborted)return;
   if(value.contractVersion!==1||value.patientId!==patient||current.current&&(value.ownerId!==current.current.ownerId||value.sourceHash!==current.current.sourceHash))throw Error();current.current=value;setData(value);
  }catch{if(alive.current&&g===generation.current&&!c.signal.aborted){clear();setError('Source access or context is unavailable. Content is cleared; refresh after restoring access.');}}
  finally{if(alive.current&&g===generation.current){locked.current=false;setBusy(false);}}
 },[patient,clear]);
 useEffect(()=>{alive.current=true;void load();const lost=()=>{clear();setError('Offline or hidden — source content and drafts are cleared. No commands are queued.');};const visible=()=>{if(document.visibilityState==='hidden')lost();else{clear();void load();}};const refresh=()=>{clear();void load();};const restored=(e:PageTransitionEvent)=>{if(e.persisted)refresh();};
  const timer=setInterval(()=>{if(!locked.current){clear();void load();}},60000);
  window.addEventListener('offline',lost);window.addEventListener('online',refresh);window.addEventListener('focus',refresh);window.addEventListener('pageshow',restored);document.addEventListener('visibilitychange',visible);
  return()=>{alive.current=false;generation.current++;controller.current?.abort();clearInterval(timer);window.removeEventListener('offline',lost);window.removeEventListener('online',refresh);window.removeEventListener('focus',refresh);window.removeEventListener('pageshow',restored);document.removeEventListener('visibilitychange',visible);};
 },[clear,load]);
 async function save(action:'document'|'link'){
  if(!data||locked.current||!navigator.onLine)return;const selectedClaim=data.claims.find(c=>c.id===claim),selectedSource=data.sources.find(s=>`${s.format}:${s.id}`===source);
  if(action==='link'&&(!selectedClaim||!selectedSource))return;
  const body=action==='document'?{action,title,content,effectiveAt:effective?new Date(effective+'Z').toISOString():null}:{action,claim,expectedVersion:selectedClaim!.version,format:selectedSource!.format as GraphSourceFormat,source:selectedSource!.id,relationship:relation};
  locked.current=true;const g=++generation.current,c=new AbortController();controller.current?.abort();controller.current=c;setBusy(true);setInspection(null);setError('');
  try{const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},cache:'no-store',signal:c.signal,body:JSON.stringify({...body,patient,commandKey:`ingest-${crypto.randomUUID()}`,sourceHash:data.sourceHash})});if(!r.ok)throw Error(String(r.status));const result=await r.json();if(!alive.current||g!==generation.current||c.signal.aborted)return;if(result.patientId!==patient)throw Error();clear();await load();setMessage(action==='document'?'Synthetic document imported. It is not a clinical chart entry.':'Evidence relationship recorded. The claim remains unverified.');
  }catch(e){if(alive.current&&g===generation.current&&!c.signal.aborted){clear();setError(e instanceof Error&&e.message==='409'?'The source or claim changed. Refresh and review before linking.':'The write could not be confirmed. It may have committed; refresh before sending another command.');}}
  finally{if(alive.current&&g===generation.current){locked.current=false;setBusy(false);}}
 }
 async function inspect(id:string, trigger:HTMLButtonElement){if(!data||locked.current||!navigator.onLine)return;inspectionTrigger.current=trigger;const before=data;locked.current=true;const g=++generation.current,c=new AbortController();controller.current?.abort();controller.current=c;setBusy(true);setInspection(null);setError('');
  try{const r=await fetch(endpoint+'?'+new URLSearchParams({patient,edge:id}),{cache:'no-store',signal:c.signal});if(!r.ok)throw Error();const v:View=await r.json();if(!alive.current||g!==generation.current||c.signal.aborted)return;if (v.contractVersion !== 1 || v.patientId !== patient || v.ownerId !== before.ownerId
      || v.sourceHash !== before.sourceHash || v.inspection?.edge.id !== id
      || !v.inspection.edge.source || v.inspection.claim?.evidenceState !== 'unverified') throw Error();
   setInspection(v.inspection);}
  catch{if(alive.current&&g===generation.current&&!c.signal.aborted){clear();setError('Exact evidence is unavailable or changed. Content is cleared; refresh before continuing.');}}
  finally{if(alive.current&&g===generation.current){locked.current=false;setBusy(false);}}
 }
 return <div className={styles.workspace}><div className="page-note">Synthetic evidence imports and human annotations only. Supported does not mean clinically verified. Sources and drafts clear when hidden, offline or refreshed; access refreshes every minute.</div><div className="page-actions"><button className="btn-line" disabled={busy} onClick={()=>{clear();void load();}}>Refresh evidence sources</button>{busy&&<button className="btn-line" onClick={()=>{clear();setError('Request cancelled. A write may have committed; refresh before sending another command.');}}>Cancel source request</button>}</div>{busy&&<p role="status">Checking current source access…</p>}{message&&<p role="status">{message}</p>}{error&&<p role="alert">{error}</p>}{data&&<>
 <section className="card"><h2>Import a synthetic document</h2><p>Owner-scoped plain text, version 1. No external URL is fetched. Recorded time is preserved separately from the document’s effective time.</p><div className={styles.form}><label>Document title<input maxLength={160} value={title} disabled={busy} onChange={e=>setTitle(e.target.value)}/></label><label>Effective time (UTC, optional)<input type="datetime-local" value={effective} disabled={busy} onChange={e=>setEffective(e.target.value)}/></label><label className={styles.wide}>Synthetic document text<textarea rows={4} maxLength={8000} value={content} disabled={busy} onChange={e=>setContent(e.target.value)}/></label></div><button className="btn-dark" disabled={busy||!title.trim()||!content.trim()} onClick={()=>void save('document')}>Import synthetic document</button></section>
 <section className="card"><h2>Link a source to a claim revision</h2><p>Author: your current signed-in identity. Select an exact current timeline version, its server-mapped FHIR R4 representation, or an imported document. Missing effective time is shown as unknown.</p><div className={styles.form}><label>Claim revision<select aria-label="Claim revision" value={claim} disabled={busy} onChange={e=>setClaim(e.target.value)}><option value="">Choose a claim</option>{data.claims.filter(c=>c.sourceState!=='changed-or-unavailable').map(c=><option key={c.id} value={c.id}>{c.id} · revision {c.version}</option>)}</select></label><label>Relationship<select aria-label="Relationship" value={relation} disabled={busy} onChange={e=>setRelation(e.target.value as GraphRelationship)}>{data.relationships.map(r=><option key={r}>{r}</option>)}</select></label><label className={styles.wide}>Source version<select aria-label="Source version" value={source} disabled={busy} onChange={e=>setSource(e.target.value)}><option value="">Choose a source</option>{data.sources.map(s=><option key={`${s.format}:${s.id}`} value={`${s.format}:${s.id}`}>{s.format} · {s.label} · {s.recordId} · v{s.version}</option>)}</select></label></div><button className="btn-dark" disabled={busy||!claim||!source} onClick={()=>void save('link')}>Record evidence relationship</button>{data.claims.length===0&&<p>Record a claim in the Evidence claims workspace before linking sources.</p>}</section>
 <section className="card">
  <h2>Evidence sufficiency</h2>
  <p>Local simulation policy. Every claim remains unverified.</p>
  {data.claims.length === 0 ? <p>No claim revisions to assess.</p> : (
   <ul>
    {data.claims.map(claim => (
     <li key={claim.revisionId}>
      <strong>{claim.type} · revision {claim.version}</strong>
      <p>{claim.assessment.status === 'insufficient' ? 'Insufficient evidence' : 'Meets the local evidence rule'} · Unverified</p>
      <p>{claim.assessment.distinctDatedSupport} distinct dated supporting records. Rule requires {claim.assessment.required}.</p>
      {claim.assessment.flags.length > 0 && <p>{claim.assessment.flags.map(flag => evidenceFlags[flag]).join(' · ')}</p>}
      <small>{claim.id}</small>
     </li>
    ))}
   </ul>
  )}
 </section>
 <section className="card">
  <h2>Recorded evidence relationships</h2>
  <p>Source access checked {timelineTime(data.checkedAt)}. All claims remain unverified.</p>
  <div className={styles.form}>
   <label>Filter by relationship
    <select aria-label="Filter by relationship" value={relationshipFilter} onChange={event => setRelationshipFilter(event.target.value)}>
     <option value="">All relationships</option>
     {data.relationships.map(value => <option key={value} value={value}>{value}</option>)}
    </select>
   </label>
   <label>Filter by claim
    <select aria-label="Filter by claim" value={claimFilter} onChange={event => setClaimFilter(event.target.value)}>
     <option value="">All claims</option>
     {data.claims.map(value => <option key={value.id} value={value.id}>{value.id}</option>)}
    </select>
   </label>
  </div>
  {visibleEdges.length === 0 ? <p>No available relationships match these filters.</p> :
   <div className={styles.edges}>{visibleEdges.map(edge => {
    const source = edge.source!;
    return <article key={edge.id}>
     <div className={styles.heading}>
      <strong>{edge.relationship}</strong><span className="record-badge">Unverified</span>
     </div>
     <p>{edge.claimId}</p>
     <p>{source.label} · {source.format} · {source.recordId} · version {source.version}</p>
     <p>Effective {source.effectiveAt ? timelineTime(source.effectiveAt) : 'Unknown'} · Recorded {timelineTime(source.recordedAt)}</p>
     <button className="btn-line" disabled={busy} onClick={event => void inspect(edge.id,event.currentTarget)}>
      Inspect exact evidence {edge.id}
     </button>
    </article>;
   })}</div>}
 </section>
 {inspection && <EvidenceDrawer inspection={inspection} trigger={inspectionTrigger.current} onClose={() => setInspection(null)}/>}
 </>}</div>;
}
