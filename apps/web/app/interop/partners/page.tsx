/* Individual page workspace */
import {PageHeader,PageActions} from "@/components/page-workspace";
import { AppError,getDb,listIntegrationWorkspace,listIntegrationEncounters,listMasterPatients,readMasterPatient } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { PartnerWorkspace } from "@/components/partner-workspace";
import { requireSession } from "@/lib/session";
export default async function PartnersPage(){const ctx=await requireSession();try{
 const db=getDb(),workspace=listIntegrationWorkspace(db,ctx);
 const patients=workspace.manage?[]:listMasterPatients(db,ctx).filter(row=>{try{readMasterPatient(db,ctx,row.id);return true;}catch{return false;}}).map(row=>({id:row.id,label:`${row.family_name}, ${row.given_name} · ${row.mrn}`}));
 const encounters=workspace.manage?[]:listIntegrationEncounters(db,ctx);
 return <Shell ctx={ctx} current="interop"><a href="/interop">← Interoperability</a><PageHeader section="Interoperability" href="/interop" icon="plug"><h1 className="page-title">Partner exchange</h1></PageHeader><PageActions><a href="/interop/reconciliation">Open bulk movement and reconciliation</a></PageActions><p className="lede">Review incoming observations and manage signed delivery to connected partners.</p><p>Local synthetic simulation · Explicit clinical review · Signed server-to-server messages</p><PartnerWorkspace initial={workspace} patients={patients} encounters={encounters}/></Shell>;
 }catch(error){return <Shell ctx={ctx} current="interop"><PageHeader section="Interoperability" href="/interop" icon="plug"><h1 className="page-title">Partner exchange</h1></PageHeader><p role="alert">{error instanceof AppError?error.message:"Partner exchange is unavailable. Restore the service and retry."}</p><a href="/interop/partners">Retry partner exchange</a></Shell>;}}
