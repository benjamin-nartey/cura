/* Individual page workspace */
import {PageHeader,PageActions} from "@/components/page-workspace";
import {TwinOperations} from "@/components/twin-operations";
import { TwinConflicts } from "@/components/twin-conflicts";
import { TwinProjection } from "@/components/twin-projection";
import { getDb,assertTwinInspectionAccess } from "@curasphere/domain";
import { requireSession } from "@/lib/session";
import { Shell } from "@/components/shell";
import { TimelineSafety } from "@/components/timeline-safety";
import { TwinEvidence } from "@/components/twin-evidence";
export default async function TwinPage({params}:{params:Promise<{id:string}>}){const ctx=await requireSession(),{id}=await params;try{assertTwinInspectionAccess(getDb(),ctx,id);}catch{return <Shell ctx={ctx} current="patients"><PageHeader section="Patients" href="/patients" icon="users"><h1 className="page-title">Patient Twin</h1></PageHeader><p role="alert">That patient is unavailable for this facility.</p></Shell>;}return <Shell ctx={ctx} current="patients" compactMobile><PageActions><a href={`/patients/${id}/twin`}>Clinician overview</a> · <a href={`/patients/${id}/chart`}>Patient chart</a> · <a href={`/patients/${id}/timeline`}>Clinical timeline</a></PageActions><PageHeader section="Patients" href="/patients" icon="users" description={<>Source evidence and operational tools</>}><h1 className="page-title">Patient Twin</h1></PageHeader><p>Simulation record · Not for live clinical use.</p><TimelineSafety key={id}><TwinOperations patient={id}/><TwinProjection patient={id}/><TwinConflicts patient={id}/><TwinEvidence patient={id}/></TimelineSafety></Shell>;}
