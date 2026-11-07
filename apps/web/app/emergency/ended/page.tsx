/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { Shell } from "@/components/shell";
import { emergencyContext } from "@/lib/emergency";

const REASONS: Record<string, string> = {
  expired: "The emergency access time ended.",
  revoked: "Emergency access was ended.",
  ended: "Emergency access is no longer valid.",
};

export default async function EmergencyEndedPage({ searchParams }: { searchParams: Promise<{ reason?: string }> }) {
  const ctx = await emergencyContext();
  const query = await searchParams;
  const reason = REASONS[query.reason ?? ""] ?? REASONS.ended;
  return (
    <Shell ctx={ctx} current="emergency" title="Emergency access ended">
      <section className="panel card">
        <PageHeader section="Emergency access" href="/emergency" icon="shieldCheck"><h1 className="page-title">Emergency access ended</h1></PageHeader>
        <p role="status">{reason}</p>
        <p>The restricted record is no longer shown.</p>
        <p><a href="/emergency/history">Your emergency access history</a></p>
        <p><a href="/dashboard">Back</a></p>
      </section>
    </Shell>
  );
}
