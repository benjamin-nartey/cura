import {PageHeader} from "@/components/page-workspace";
import { currentEmergencyGrant, getDb, readSyntheticEmergency } from "@curasphere/domain";
import { redirect } from "next/navigation";
import { EmergencyActive } from "@/components/emergency-active";
import { Shell } from "@/components/shell";
import { emergencyActor, emergencyContext } from "@/lib/emergency";

export default async function EmergencyActivePage() {
  const ctx = await emergencyContext();
  const actor = emergencyActor(ctx);
  const grant = currentEmergencyGrant(getDb(), actor) as { id: string; resource_id: string; expires_at: string; request_id: string } | null;
  if (!grant) redirect("/emergency/ended?reason=ended");
  let record: { display_name: string; summary: string };
  try {
    record = readSyntheticEmergency(getDb(), actor, grant.resource_id);
  } catch {
    redirect("/emergency/ended?reason=ended");
  }
  return (
    <Shell ctx={ctx} current="emergency" title="Emergency access active">
      <PageHeader section="Emergency access" href="/emergency" icon="shieldCheck" description="Access remains limited to the approved grant, its resource scope, and its expiry."><h1 className="page-title">Time-limited emergency access</h1></PageHeader>
      <EmergencyActive grantId={grant.id} resourceName={record.display_name} summary={record.summary} expiresAt={grant.expires_at} requestId={grant.request_id} />
    </Shell>
  );
}
