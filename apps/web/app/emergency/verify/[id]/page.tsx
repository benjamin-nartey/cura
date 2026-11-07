/* Individual page workspace */
import {PageHeader,PageActions} from "@/components/page-workspace";
import { listPasskeys, readTotpStatus, getDb } from "@curasphere/domain";
import { notFound } from "next/navigation";
import { EmergencyPasskey } from "@/components/emergency-passkey";
import { Shell } from "@/components/shell";
import { emergencyContext } from "@/lib/emergency";

export default async function EmergencyVerifyPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string }> }) {
  const ctx = await emergencyContext();
  const { id } = await params;
  const query = await searchParams;
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(id)) notFound();
  const totp = readTotpStatus(getDb(), ctx.userId);
  const passkeys = listPasskeys(getDb(), ctx.userId).filter((row) => row.status === "active");
  return (
    <Shell ctx={ctx} current="emergency" title="Verify identity">
      <header className="chart-head">
        <div>
          <PageHeader section="Emergency access" href="/emergency" icon="shieldCheck" eyebrow={<>Identity verification</>} description={<>A fresh verification is required. Submitting a reason does not grant access.</>}><h1 className="page-title">Verify your identity</h1></PageHeader>
        </div>
      </header>
      {query.error ? <p role="alert">Verification was not accepted. Try again or cancel.</p> : null}
      {totp === "active" ? (
        <form className="panel card form-grid" method="post" action={`/api/emergency-access/requests/${id}/verify`}>
          <label className="field">Authenticator code
            <input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" required />
          </label>
          <button type="submit">Verify authenticator</button>
        </form>
      ) : (
        <p role="status">No authenticator is enrolled for this account.</p>
      )}
      {passkeys.length > 0 ? <EmergencyPasskey requestId={id} /> : <p>No passkey is enrolled for this account.</p>}
      <PageActions><a href="/emergency">Cancel</a></PageActions>
    </Shell>
  );
}
