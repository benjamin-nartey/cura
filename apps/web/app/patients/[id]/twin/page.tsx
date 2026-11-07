/* Individual page workspace */
import {PageHeader,PageActions} from "@/components/page-workspace";
import {getDb,assertTwinInspectionAccess} from "@curasphere/domain";
import {requireSession} from "@/lib/session";
import {Shell} from "@/components/shell";
import {TimelineSafety} from "@/components/timeline-safety";
import {TwinInspection} from "@/components/twin-inspection";
export default async function TwinPage({params}:{params:Promise<{id:string}>}){const ctx=await requireSession(),{id}=await params;try{assertTwinInspectionAccess(getDb(),ctx,id);}catch{return <Shell ctx={ctx} current="patients"><PageHeader section="Patients" href="/patients" icon="users"><h1 className="page-title">Patient Twin</h1></PageHeader><p role="alert">This Twin is unavailable for the current care context. Restore source access and try again.</p></Shell>;}return <Shell ctx={ctx} current="patients" compactMobile><PageActions><a href={`/patients/${id}/chart`}>Patient chart</a> · <a href={`/patients/${id}/timeline`}>Clinical timeline</a> · <a href={`/patients/${id}/twin/sources`}>Source tools</a></PageActions><PageHeader section="Patients" href="/patients" icon="users" description={<>Source-gated clinician inspection</>}><h1 className="page-title">Patient Twin</h1></PageHeader><p>Simulation record · Not for live clinical use.</p><TimelineSafety key={id}><TwinInspection patient={id}/></TimelineSafety></Shell>;}
