/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { AppError,readConformanceCatalog } from "@curasphere/domain";
import { Shell } from "@/components/shell";
import { ConformanceWorkspace } from "@/components/conformance-workspace";
import { requireSession } from "@/lib/session";
export default async function ConformancePage(){const ctx=await requireSession();try{return <Shell ctx={ctx} current="interop"><a href="/interop">← Interoperability</a><PageHeader section="Interoperability" href="/interop" icon="plug" description={<>Inspect supported interfaces, versioned R4 artifacts and compatibility boundaries.</>}><h1 className="page-title">Published conformance</h1></PageHeader><ConformanceWorkspace catalog={readConformanceCatalog()}/></Shell>;}catch(error){return <Shell ctx={ctx} current="interop"><PageHeader section="Interoperability" href="/interop" icon="plug"><h1 className="page-title">Published conformance</h1></PageHeader><p role="alert">{error instanceof AppError?error.message:"Conformance publication is unavailable. Restore the local configuration and retry."}</p><a href="/interop/conformance">Retry conformance</a></Shell>;}}
