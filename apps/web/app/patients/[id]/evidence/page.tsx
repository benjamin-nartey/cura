import {assertGraphClaimAccess,getDb} from "@curasphere/domain";
import {requireSession} from "@/lib/session";
import {Shell} from "@/components/shell";
import {PageHeader,PageActions} from "@/components/page-workspace";
import {EvidenceClaims} from "@/components/evidence-claims";

export default async function EvidencePage({params}:{params:Promise<{id:string}>}){
  const ctx=await requireSession(),{id}=await params;
  try{assertGraphClaimAccess(getDb(),ctx,id);}
  catch{return <Shell ctx={ctx} current="patients"><PageHeader section="Patients" href="/patients" icon="fileSearch"><h1 className="page-title">Evidence claims</h1></PageHeader><p role="alert">Evidence claims are unavailable in the current care context. Restore source access and try again.</p></Shell>;}
  return <Shell ctx={ctx} current="patients" compactMobile><PageHeader section="Patient chart" href={`/patients/${id}/chart`} icon="fileSearch" description="Typed draft claims with immutable revisions and source-version provenance."><h1 className="page-title">Evidence claims</h1></PageHeader><PageActions><a href={`/patients/${id}/evidence/sources`}>Evidence sources</a><a href={`/patients/${id}/chart`}>Patient chart</a><a href={`/patients/${id}/timeline`}>Clinical timeline</a><a href={`/patients/${id}/twin`}>Patient Twin</a></PageActions><EvidenceClaims key={id} patient={id}/></Shell>;
}
