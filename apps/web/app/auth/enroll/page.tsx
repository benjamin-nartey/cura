import { getDb, listPasskeys, readTotpStatus } from "@curasphere/domain";
import { cookies } from "next/headers";
import { Feedback } from "@/components/feedback";
import { PasskeyPanel } from "@/components/passkey-panel";
import { Shell } from "@/components/shell";
import { readFeedback } from "@/lib/messages";
import { requireSession } from "@/lib/session";
import { prepareIdentityDatabase } from "@/lib/workforce-auth";

export default async function EnrollPage({ searchParams }: { searchParams: Promise<{ error?: string; notice?: string }> }) {
  const ctx = await requireSession();
  const db = await prepareIdentityDatabase();
  const status = readTotpStatus(getDb(), ctx.userId);
  const jar = await cookies();
  const secret = jar.get("cura_totp_setup")?.value ?? "";
  const recovery = (jar.get("cura_totp_recovery")?.value ?? "").split(",").filter(Boolean);
  const feedback = readFeedback(await searchParams);
  const passkeys = listPasskeys(db, ctx.userId).filter((item) => item.status === "active");
  return (
    <Shell ctx={ctx} current="account" title="Authenticators">
      <section className="card account-card">
        <p className="eyebrow">Authenticator</p>
        <h2>Enrollment</h2>
        <p className="lede">A second factor is checked by this application after the identity provider accepts the password. It does not grant another organization.</p>
        <Feedback error={feedback.error} notice={feedback.notice} />
        {status !== "active" ? (
          <form action="/api/auth/totp/enroll" method="post">
            <button className="btn-dark" type="submit">
              Start authenticator enrollment
            </button>
          </form>
        ) : (
          <form action="/api/auth/totp/revoke" method="post">
            <p role="status">An authenticator is enrolled for this account.</p>
            <button className="btn-dark" type="submit">
              Revoke authenticator
            </button>
          </form>
        )}
        {secret ? (
          <form action="/api/auth/totp/confirm" method="post" className="form-grid">
            <p>Add this secret to an authenticator app, then enter the current 6-digit code.</p>
            <p>
              <code>{secret}</code>
            </p>
            {recovery.length > 0 ? (
              <ul>
                {recovery.map((code) => (
                  <li key={code}>
                    <code>{code}</code>
                  </li>
                ))}
              </ul>
            ) : null}
            <label htmlFor="enroll-code">6-digit code</label>
            <input id="enroll-code" name="code" inputMode="numeric" autoComplete="one-time-code" required />
            <button className="btn-dark" type="submit">
              Confirm enrollment
            </button>
          </form>
        ) : null}
        <h2>Passkeys</h2>
        <PasskeyPanel mode="register" />
        {passkeys.length === 0 ? <p role="status">No passkey is enrolled.</p> : null}
        {passkeys.map((item) => (
          <form key={item.credential_id} action="/api/auth/passkey/revoke" method="post">
            <input type="hidden" name="credentialId" value={item.credential_id} />
            <button type="submit">Revoke passkey {item.credential_id.slice(0, 8)}</button>
          </form>
        ))}
      </section>
    </Shell>
  );
}
