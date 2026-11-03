import { AppError, assertSourcePreviewAccess, getDb, listMasterPatients, listSourceR4,SOURCE_MAPPING_VERSION } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { FhirSourcePreview } from "@/components/fhir-source-preview";
import { requireSession } from "@/lib/session";
export default async function SourcePage({searchParams}:{searchParams:Promise<{patient?:string}>}){
 const ctx=await requireSession(),query=await searchParams;
 let patients:ReturnType<typeof listMasterPatients>=[],choices:ReturnType<typeof listSourceR4>["rows"]=[],error="";
 try{assertSourcePreviewAccess(getDb(),ctx);patients=listMasterPatients(getDb(),ctx);if(query.patient)choices=listSourceR4(getDb(),ctx,query.patient).rows;}catch(problem){error=problem instanceof AppError?problem.message:"Source preview is unavailable. Retry after restoring the dependency.";}
 return <Shell ctx={ctx} current="interop"><a href="/interop">← Interoperability</a><h1 className="page-title">FHIR source workbench</h1><p className="lede">Inspect versioned R4 mappings of the current clinical record.</p>
 <p>Local synthetic simulation · Mapping {SOURCE_MAPPING_VERSION} · Read-only comparisons. This is a CuraSphere source profile, not US Core or clinical approval. External imports and delivery are separate workflows.</p>
 {error?<p role="alert">{error}</p>:<><form method="get" className="card"><label htmlFor="source-patient">Patient</label><select id="source-patient" name="patient" defaultValue={query.patient??""} required><option value="">Select a patient</option>{patients.map(patient=><option key={patient.id} value={patient.id}>{patient.family_name}, {patient.given_name} · {patient.mrn}</option>)}</select><button className="btn-dark" type="submit" style={{marginTop:16}}>Open source records</button></form>{query.patient?<FhirSourcePreview key={query.patient} choices={choices}/>:<p>Select a patient to see the source records available to your role.</p>}</>}
 </Shell>;
}
