import { Icon, type IconName } from "@/components/icon";

export function PlatformIllustration() {
  return <div className="platform-art" aria-label="Illustration of connected clinical records and care coordination">
    <div className="art-orbit orbit-one" /><div className="art-orbit orbit-two" />
    <div className="art-note"><span className="live-dot" /> Connected by design <Icon name="plug" size={15} /></div>
    <div className="art-workspace">
      <div className="art-sidebar"><span className="art-logo">C<span>+</span></span>{(["grid", "users", "calendar", "activity", "wallet"] as IconName[]).map((name, i) => <div className={i === 1 ? "selected" : ""} key={name}><Icon name={name} size={17} /></div>)}</div>
      <div className="art-body">
        <div className="art-top"><span>Clinical workspace</span><span className="art-avatar">CT</span></div>
        <div className="art-patient"><span className="patient-monogram">PT</span><div><strong>Patient overview</strong><small>Identity · Visit · Care history</small></div><span className="art-status">Open visit</span></div>
        <div className="art-tabs"><b>Overview</b><span>Timeline</span><span>Care team</span></div>
        <div className="art-panels"><div><small>PATIENT RECORD</small><strong>One connected view</strong><svg viewBox="0 0 260 65" aria-hidden="true"><path d="M0 40H40L49 28 58 46 69 15 80 52 90 35H140L150 24 160 45 174 10 186 54 197 36H260" fill="none" stroke="#2c8175" strokeWidth="2" /></svg><span className="art-caption">Source records remain authoritative</span></div><div className="art-record"><Icon name="fileSearch" size={22} /><strong>Visit summary</strong><span>Clinical entries</span><span>Care coordination</span><span>Billing context</span></div></div>
        <div className="art-timeline"><small>CARE TIMELINE</small>{["Appointment confirmed", "Encounter opened", "Source entry recorded"].map((label, i) => <div key={label}><i /><span>{label}</span><small>{["09:00", "09:15", "09:24"][i]}</small></div>)}</div>
      </div>
    </div>
    <div className="art-floating"><span className="art-shield"><Icon name="shieldCheck" size={23} /></span><div><strong>Access with context</strong><small>Role · Facility · Purpose</small></div></div>
    <span className="art-disclaimer">ILLUSTRATIVE WORKSPACE</span>
  </div>;
}
