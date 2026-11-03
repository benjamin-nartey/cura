import type { DirectoryEntry } from "@curasphere/contracts";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Icon } from "@/components/icon";
import { Feedback } from "@/components/feedback";
import { readFoundationDirectory } from "@/lib/foundation";
import { roleLabel } from "@/lib/format";
import { readFeedback } from "@/lib/messages";
import { optionalSession } from "@/lib/session";

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  if (await optionalSession()) redirect("/dashboard");
  const feedback = readFeedback(await searchParams);
  const directory = await readFoundationDirectory();
  const groups = new Map<string, DirectoryEntry[]>();
  for (const entry of directory.entries) groups.set(entry.organizationName, [...(groups.get(entry.organizationName) ?? []), entry]);
  const error = feedback.error ?? (directory.disabled ? null : directory.unavailable ? "The foundation service is not running. Please try again when it is available." : null);
  return <main className="login-page" id="content">
    <section className="login-story"><Brand light /><div className="login-story-copy"><p className="premium-kicker">YOUR WORK. CONNECTED.</p><h1>Care begins<br />with <em>connection.</em></h1><p>A calmer workspace. A clearer picture. More room for the people who matter.</p><div className="login-orbit" aria-hidden="true"><div /><span><Icon name="heartPulse" size={48} /></span><i className="orbit-point one" /><i className="orbit-point two" /><i className="orbit-point three" /></div></div><div className="login-story-footer"><Icon name="shieldCheck" size={21} /><span>Source records stay authoritative.<br />Access stays grounded in context.</span></div></section>
    <section className="login-form-side"><a className="back-home" href="/">← Back to CuraSphere</a><div className="login-form-content"><div className="login-lock"><Icon name="shieldCheck" size={27} /></div><p className="premium-kicker">CURASPHERE WORKSPACE</p><h2>Welcome back.</h2><p className="login-subtitle">Sign in to your organization’s workspace.</p><Feedback error={error} notice={null} /><a className="premium-button login-sso" href="/api/auth/start"><Icon name="building" size={19} /> Continue with your organization <span aria-hidden="true">→</span></a><p className="login-helper">Use your workforce identity. Your organization manages your access.</p>
    {directory.entries.length > 0 ? <details className="development-login"><summary>Simulation workspace <span aria-hidden="true">+</span></summary><p>Choose a team member to explore realistic workflows with synthetic records. Production access is not available.</p><form action="/api/session" method="post"><label htmlFor="development-identity">Workspace identity</label><select id="development-identity" name="userId" required defaultValue=""><option value="" disabled>Select an identity</option>{[...groups.entries()].map(([organization, people]) => <optgroup label={organization} key={organization}>{people.map(person => <option key={person.userId} value={person.userId}>{person.displayName} · {roleLabel(person.role)}{person.facilityName ? ` · ${person.facilityName}` : ""}</option>)}</optgroup>)}</select><button className="premium-button" type="submit">Open workspace <span aria-hidden="true">→</span></button></form></details> : null}
    <div className="login-patient"><Icon name="users" size={20} /><div>Looking for your own health record?<br /><a href="/portal">Visit the patient portal <span aria-hidden="true">↗</span></a></div></div></div><p className="login-environment"><span className="live-dot" /> Simulation environment · Workspace information</p></section>
  </main>;
}
