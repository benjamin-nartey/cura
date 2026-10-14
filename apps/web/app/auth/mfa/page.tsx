import { cookies } from "next/headers";
import { getDb, pendingLoginOpen } from "@curasphere/domain";
import { Feedback } from "@/components/feedback";
import { readFeedback } from "@/lib/messages";
import { redirect } from "next/navigation";

export default async function MfaPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const jar = await cookies();
  const pendingId = jar.get("cura_mfa")?.value;
  if (!pendingId) redirect("/");
  try {
    pendingLoginOpen(getDb(), pendingId);
  } catch {
    redirect("/?error=expired");
  }
  const query = await searchParams;
  const feedback = readFeedback(query);
  return (
    <main className="gate" id="content">
      <section className="panel card">
        <p className="eyebrow">Authenticator</p>
        <h1>Enter the verification code</h1>
        <p className="lede">This code comes from the authenticator enrolled for this account. It is checked on the server.</p>
        <Feedback error={feedback.error} notice={null} />
        <form action="/api/auth/mfa" method="post" className="form-grid">
          <label htmlFor="mfa-code">6-digit code or recovery code</label>
          <input id="mfa-code" name="code" inputMode="numeric" autoComplete="one-time-code" autoFocus required />
          <button className="btn-dark" type="submit">
            Verify
          </button>
        </form>
        <p>
          <a href="/auth/passkey">Use a passkey instead</a>
        </p>
      </section>
    </main>
  );
}
