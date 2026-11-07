/* Individual page workspace */
import {PageHeader,PageActions} from "@/components/page-workspace";
import { TimelineSafety } from "@/components/timeline-safety";
import { TimelineProjection } from "@/components/timeline-projection";
import { getDb,readMasterPatient } from "@curasphere/domain";
import { requireSession } from "@/lib/session";
import { Shell } from "@/components/shell";
import { CanonicalTimeline } from "@/components/canonical-timeline";
export default async function TimelinePage({params}:{params:Promise<{id:string}>}){const ctx=await requireSession(),{id}=await params;let patient;try{patient=readMasterPatient(getDb(),ctx,id);}catch{return <Shell ctx={ctx} current="patients"><PageHeader section="Patients" href="/patients" icon="users"><h1 className="page-title">Clinical timeline</h1></PageHeader><p role="alert">That patient is unavailable for this facility.</p></Shell>;}return <Shell ctx={ctx} current="patients" compactMobile><PageActions><a href={`/patients/${id}/chart`}>← Patient chart</a></PageActions><PageHeader section="Patients" href="/patients" icon="users" description={<>{patient.given_name} {patient.family_name} · version-linked source records</>}><h1 className="page-title">Clinical timeline</h1></PageHeader><p>Simulation record · Not for live clinical use.</p><PageActions><a href={`/patients/${id}/timeline/explore`}>Filter events and compare snapshots</a></PageActions><TimelineSafety key={id}><TimelineProjection key={id} patientId={id}/><CanonicalTimeline key={id} patientId={id}/></TimelineSafety></Shell>;}
