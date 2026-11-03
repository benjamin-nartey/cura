import { AppError, effectivePermissions, getDb, listControlledValueSets, UNIT_PACK_VERSION, SUPPORTED_UNIT_CODES } from "@curasphere/domain";
import { redirect } from "next/navigation";
import { Shell } from "@/components/shell";
import { ConversionForm, MembershipForm, ValueSetForm } from "@/components/terminology-tools";
import { requireSession } from "@/lib/session";
export default async function ValidationPage() {
  const ctx=await requireSession();const access=effectivePermissions(getDb(),ctx.userId,ctx.organizationId,ctx.facilityId);
  if(!access.permissions.includes("terminology.read"))redirect("/access/denied");
  let sets:ReturnType<typeof listControlledValueSets>=[];let error:string|null=null;
  try{sets=listControlledValueSets(getDb(),ctx);}catch(problem){error=problem instanceof AppError?problem.message:"Terminology validation is unavailable.";}
  return <Shell ctx={ctx} current="terminology"><a href="/terminology">← Terminology registry</a><h1 className="page-title">Terminology validation</h1><p className="lede">Inspect versioned code membership and dimensionally compatible quantities.</p>{error?<p role="alert">{error} <a href="/terminology/validation">Retry</a></p>:<><section className="card"><h2>Value-set versions</h2>{sets.length?<div className="data-table-region" role="region" aria-label="Value-set versions" tabIndex={0}><table><thead><tr><th scope="col">Value set</th><th scope="col">Version</th><th scope="col">Members</th><th scope="col">Action</th></tr></thead><tbody>{sets.map(set=><tr key={set.id}><th scope="row">{set.name}</th><td>{set.version}</td><td>{set.member_count}</td><td><a href={`/terminology/value-sets/${set.id}`}>Inspect<span className="sr"> {set.name} {set.version}</span></a></td></tr>)}</tbody></table></div>:<p>No value-set versions have been registered in this organization.</p>}<p className="muted">Up to 100 versions are shown. Existing clinical catalogs are unchanged.</p></section><div style={{display:"grid",gap:24,marginTop:24}}><MembershipForm sets={sets.map(({id,name,version,member_count})=>({id,name,version,member_count}))}/><ConversionForm packVersion={UNIT_PACK_VERSION} units={[...SUPPORTED_UNIT_CODES]}/>{access.permissions.includes("terminology.manage")?<ValueSetForm/>:null}</div></>}</Shell>;
}
