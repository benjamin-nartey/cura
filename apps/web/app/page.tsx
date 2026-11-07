import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Icon, type IconName } from "@/components/icon";
import { ProductWalkthrough } from "@/components/product-walkthrough";
import { optionalSession } from "@/lib/session";

const capabilities: { icon: IconName; number: string; title: string; text: string }[] = [
  { icon: "fileSearch", number: "01", title: "The whole story. In one chart.", text: "Bring source records, encounters, and clinical history into a shared view, so your team can find the context that matters." },
  { icon: "handoff", number: "02", title: "A more connected care journey.", text: "Move from appointments to encounters, pending work, and billing with a consistent workspace across your organization." },
  { icon: "shieldCheck", number: "03", title: "Trust, built into the workflow.", text: "Keep access tied to roles, facilities, and purpose of use, with consent and audit context close at hand." },
];

export default async function HomePage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const query = await searchParams;
  if (query.error) redirect(`/login?error=${encodeURIComponent(query.error)}`);
  if (await optionalSession()) redirect("/dashboard");
  return <div className="marketing">
    <header className="marketing-nav"><Brand /><nav aria-label="Main navigation"><a href="#platform">Platform</a><a href="#approach">Our approach</a><a href="#enterprise">For enterprises</a></nav><a className="nav-signin" href="/login">Sign in <span aria-hidden="true">↗</span></a></header>
    <main id="content">
      <section className="marketing-hero cinematic-hero">
        <div className="hero-copy"><p className="premium-kicker"><span /> A CONNECTED FOUNDATION FOR CARE</p><h1>Better connected.<br />More <em>human.</em></h1><p className="hero-description">One thoughtful workspace for the people, records, and workflows behind exceptional care.</p><div className="hero-actions"><a className="premium-button" href="/login">Explore the workspace <span aria-hidden="true">↗</span></a><a className="text-link" href="#platform">Discover CuraSphere <span aria-hidden="true">↓</span></a></div><div className="hero-footnote"><Icon name="shieldCheck" size={18} /><span>Built around source records. Designed around people.</span></div></div>
      </section>
      <ProductWalkthrough />
      <div className="capability-strip"><span>ONE PLATFORM. A SHARED PERSPECTIVE.</span><div><Icon name="stethoscope" /> Clinical teams</div><div><Icon name="building" /> Healthcare organizations</div><div><Icon name="users" /> People receiving care</div></div>
      <section className="marketing-section" id="platform"><div className="section-intro"><p className="premium-kicker">THE CURASPHERE PLATFORM</p><h2>Less fragmentation.<br /><em>More perspective.</em></h2><p>Healthcare is connected. Your workspace should be, too. Bring the essential pieces together without losing sight of the person behind the record.</p></div><div className="capability-grid">{capabilities.map(item => <article className="capability-card" key={item.number}><div className="capability-card-top"><span className="capability-icon"><Icon name={item.icon} size={25} /></span><span>{item.number}</span></div><h3>{item.title}</h3><p>{item.text}</p></article>)}</div></section>
      <section className="approach-section" id="approach"><div className="connection-art" aria-hidden="true"><div className="connection-ring" /><div className="connection-ring inner" /><div className="connection-center"><Icon name="heartPulse" size={44} /></div>{["Clinical records", "Care coordination", "Identity & access", "Billing context"].map((label,i) => <span className={`connection-node node-${i}`} key={label}>{label}</span>)}</div><div><p className="premium-kicker">CONTEXT, WITHOUT COMPROMISE</p><h2>A shared view.<br /><em>A clear source of truth.</em></h2><p>CuraSphere brings workflows together while keeping source records authoritative and access boundaries explicit.</p><ul className="approach-list"><li><Icon name="shieldCheck" /> Role and facility scoped access</li><li><Icon name="fileSearch" /> Traceable source records and audit history</li><li><Icon name="handoff" /> Connected clinical and administrative workflows</li></ul></div></section>
      <section className="enterprise-cta" id="enterprise"><div><p className="premium-kicker">BUILT WITH THE ENTERPRISE IN MIND</p><h2>A thoughtful foundation.<br />For your next chapter of care.</h2><p>Explore the workspace and see how the pieces fit together.</p></div><a className="premium-button light-button" href="/login">Enter CuraSphere <span aria-hidden="true">↗</span></a></section>
    </main>
    <footer className="marketing-footer"><Brand /><p>Connected care. Human at heart.</p><a href="/portal">Patient portal ↗</a><div className="preview-disclosure"><span className="live-dot" /> Simulation environment · Synthetic records · No live clinical use.</div></footer>
  </div>;
}
