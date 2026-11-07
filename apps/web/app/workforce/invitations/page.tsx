/* Individual page workspace */
import {PageHeader} from "@/components/page-workspace";
import { cookies } from "next/headers";
import { Shell } from "@/components/shell";
import { invitationsFor, loadWorkforce } from "@/lib/workforce";

export default async function InvitationsPage({ searchParams }: { searchParams: Promise<{ notice?: string; error?: string }> }) {
  const query = await searchParams;
  const { ctx } = await loadWorkforce();
  const invitations = invitationsFor(ctx);
  const jar = await cookies();
  const sandbox = jar.get("cura_invite_once")?.value;
  return (
    <Shell ctx={ctx} current="workforce" title="Invitations">
      <header className="chart-head">
        <div>
          <PageHeader section="Workforce" href="/workforce" icon="users" eyebrow={<>Invitations</>} description={<>Messages are captured in the local sandbox. This screen does not confirm delivery to an external mailbox.</>}><h1 className="page-title">Invitation status</h1></PageHeader>
        </div>
      </header>
      {query.notice ? <p role="status">The invitation was updated.</p> : null}
      {query.error ? <p role="alert">That invitation action was not completed.</p> : null}
      {sandbox ? <p>Local sandbox copy, shown once for this workstation: {sandbox}</p> : null}
      {invitations.length === 0 ? <p className="panel card">No invitations.</p> : (
        <ul className="panel card">
          {invitations.map((invitation) => (
            <li key={invitation.id}>
              {invitation.email} · {invitation.roleId} · {invitation.status}
              {invitation.status === "pending" ? (
                <form method="post" action={`/api/workforce/invitations/${invitation.id}`}>
                  <input type="hidden" name="version" value={invitation.version} />
                  <button name="action" value="resend" type="submit">Resend</button>
                  <button name="action" value="cancel" type="submit">Cancel</button>
                </form>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </Shell>
  );
}
