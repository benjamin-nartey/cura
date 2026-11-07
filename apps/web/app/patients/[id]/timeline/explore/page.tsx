/* Individual page workspace */
import {PageHeader,PageActions} from "@/components/page-workspace";
import { TimelineSafety } from "@/components/timeline-safety";
import { getDb,readMasterPatient } from "@curasphere/domain";
import { requireSession } from "@/lib/session";
import { Shell } from "@/components/shell";
import { TimelineExplorer } from "@/components/timeline-explorer";
export default async function Page({params}:{params:Promise<{id:string}>}){const ctx=await requireSession(),{id}=await params;let patient;try{patient=readMasterPatient(getDb(),ctx,id);}catch{return <Shell ctx={ctx} current="patients"><PageHeader section="Patients" href="/patients" icon="users"><h1 className="page-title">Timeline explorer</h1></PageHeader><p role="alert">That patient is unavailable for this facility.</p></Shell>;}return <Shell ctx={ctx} current="patients" compactMobile><PageActions><a href={`/patients/${id}/timeline`}>← Clinical timeline</a></PageActions><PageHeader section="Patients" href="/patients" icon="users" description={<>{patient.given_name} {patient.family_name} · source-backed history and changes</>}><h1 className="page-title">Timeline explorer</h1></PageHeader><p>Simulation record · Not for live clinical use.</p><TimelineSafety key={id}><TimelineExplorer key={id} patientId={id}/></TimelineSafety></Shell>;}
