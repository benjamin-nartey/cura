import type { SessionContext } from "@curasphere/contracts";
import { canReadChart, canReviewAudit, effectivePermissions, getDb } from "@curasphere/domain";
import { Sidebar } from "@/components/sidebar";
import { Brand } from "@/components/brand";
import { AccountMenu } from "@/components/account-menu";
import { Icon, type IconName } from "@/components/icon";
import { purposeLabel, roleLabel } from "@/lib/format";

type LinkId =
  | "terminology"
  | "dashboard"
  | "facility"
  | "worklist"
  | "patients"
  | "practitioners"
  | "appointments"
  | "clinical"
  | "work"
  | "billing"
  | "coordination"
  | "operations"
  | "interop"
  | "gateway"
  | "agents"
  | "imaging"
  | "devices"
  | "audit"
  | "analytics"
  | "population"
  | "research"
  | "evaluation"
  | "release-train"
  | "modules"
  | "revenue"
  | "enterprise"
  | "marketplace"
  | "tenancy"
  | "access"
  | "workforce"
  | "emergency"
  | "consent"
  | "retention"
  | "requests"
  | "telemetry";

const LINKS: ReadonlyArray<{ href: string; id: LinkId; label: string; group: string; icon: IconName }> = [
  { href: "/terminology", id: "terminology", label: "Terminology", group: "Reference", icon: "book" },
  { href: "/dashboard", id: "dashboard", label: "Dashboard", group: "Main", icon: "grid" },
  { href: "/tenancy", id: "tenancy", label: "Organization", group: "Main", icon: "shieldCheck" },
  { href: "/access", id: "access", label: "Access", group: "Main", icon: "shieldCheck" },
  { href: "/workforce", id: "workforce", label: "Workforce", group: "Main", icon: "users" },
  { href: "/emergency", id: "emergency", label: "Emergency access", group: "Main", icon: "shieldCheck" },
  { href: "/facility", id: "facility", label: "Beds and wards", group: "Main", icon: "bed" },
  { href: "/worklist", id: "worklist", label: "Worklist", group: "Main", icon: "checklist" },
  { href: "/patients", id: "patients", label: "Patients", group: "Main", icon: "users" },
  { href: "/practitioners", id: "practitioners", label: "Practitioners", group: "Main", icon: "users" },
  { href: "/appointments", id: "appointments", label: "Appointments", group: "Main", icon: "calendar" },
  { href: "/clinical", id: "clinical", label: "Clinical entries", group: "Main", icon: "activity" },
  { href: "/work", id: "work", label: "Pending work", group: "Main", icon: "checklist" },
  { href: "/billing", id: "billing", label: "Charges", group: "Main", icon: "wallet" },
  { href: "/coordination", id: "coordination", label: "Coordination", group: "Main", icon: "handoff" },
  { href: "/operations", id: "operations", label: "Operations", group: "Monitoring", icon: "activity" },
  { href: "/interop", id: "interop", label: "Interop", group: "Monitoring", icon: "plug" },
  { href: "/gateway", id: "gateway", label: "Gateway", group: "Monitoring", icon: "shield" },
  { href: "/agents", id: "agents", label: "Agents", group: "Monitoring", icon: "bot" },
  { href: "/imaging", id: "imaging", label: "Imaging", group: "Monitoring", icon: "scan" },
  { href: "/devices", id: "devices", label: "Devices", group: "Monitoring", icon: "heartPulse" },
  { href: "/audit", id: "audit", label: "Audit", group: "Reports", icon: "fileSearch" },
  { href: "/consent", id: "consent", label: "Consent", group: "Reports", icon: "shieldCheck" },
  { href: "/privacy/retention", id: "retention", label: "Retention", group: "Reports", icon: "shieldCheck" },
  { href: "/privacy/requests", id: "requests", label: "Privacy requests", group: "Reports", icon: "fileSearch" },
  { href: "/privacy/telemetry", id: "telemetry", label: "Privacy telemetry", group: "Reports", icon: "shield" },
  { href: "/analytics", id: "analytics", label: "Analytics", group: "Reports", icon: "chart" },
  { href: "/population", id: "population", label: "Population", group: "Reports", icon: "globe" },
  { href: "/research", id: "research", label: "Research", group: "Reports", icon: "flask" },
  { href: "/evaluation", id: "evaluation", label: "Evaluation", group: "Reports", icon: "gauge" },
  { href: "/release-train", id: "release-train", label: "Release train", group: "Reports", icon: "branch" },
  { href: "/modules", id: "modules", label: "Modules", group: "Reports", icon: "boxes" },
  { href: "/revenue", id: "revenue", label: "Revenue", group: "Admin", icon: "wallet" },
  { href: "/enterprise", id: "enterprise", label: "Enterprise", group: "Admin", icon: "building" },
  { href: "/marketplace", id: "marketplace", label: "Marketplace", group: "Admin", icon: "store" },
];

const TITLES: Record<LinkId | "account", string> = {
  terminology: "Terminology",
  dashboard: "Dashboard",
  tenancy: "Organization",
  access: "Access",
  workforce: "Workforce",
  emergency: "Emergency access",
  facility: "Beds and wards",
  worklist: "Worklist",
  patients: "Patients",
  practitioners: "Practitioners",
  appointments: "Appointments",
  clinical: "Clinical entries",
  work: "Pending work",
  billing: "Charges",
  coordination: "Coordination",
  operations: "Operations",
  interop: "Interop",
  gateway: "Gateway",
  agents: "Agents",
  imaging: "Imaging",
  devices: "Devices",
  audit: "Audit",
  consent: "Consent",
  retention: "Retention",
  requests: "Privacy requests",
  telemetry: "Privacy telemetry",
  analytics: "Analytics",
  population: "Population",
  research: "Research",
  evaluation: "Evaluation",
  "release-train": "Release train",
  modules: "Modules",
  revenue: "Revenue",
  enterprise: "Enterprise",
  marketplace: "Marketplace",
  account: "Account",
};

export type ShellSection = LinkId | "account";

export async function Shell({
  ctx,
  current,
  title,
  compactMobile = false,
  children,
}: {
  ctx: SessionContext;
  current: ShellSection;
  title?: string;
  compactMobile?: boolean;
  children: React.ReactNode;
}) {
  const access = effectivePermissions(getDb(), ctx.userId, ctx.organizationId, ctx.facilityId);
  const allowed = new Set(access.permissions);
  const governed = access.roles.length > 0 || access.review.includes("not active");
  const chart = governed ? allowed.has("clinical.read") : canReadChart(ctx);
  const links = LINKS.filter((link) => {
    if (link.id === "terminology") return allowed.has("terminology.read");
    if (link.id === "workforce") return governed && allowed.has("workforce.read");
    if (link.id === "emergency") return allowed.has("emergency.request") || allowed.has("emergency.review.read");
    if (link.id === "access" || link.id === "dashboard") return true;
    if (!governed) {
      if (link.id === "audit") return canReviewAudit(ctx);
      if (link.id === "analytics" || link.id === "population" || link.id === "research" || link.id === "evaluation" || link.id === "release-train" || link.id === "modules") return ctx.role === "auditor";
      if (link.id === "revenue" || link.id === "enterprise") return ctx.role === "admin";
      if (link.id === "marketplace") return ctx.role === "admin" || ctx.role === "auditor";
      if (link.id === "gateway" || link.id === "tenancy") return true;
      return canReadChart(ctx);
    }
    if (link.id === "consent") return allowed.has("consent.read") || allowed.has("consent.manage") || allowed.has("consent.history.read");
    if (link.id === "retention") return allowed.has("retention.policy.read") || allowed.has("legal-hold.read") || allowed.has("retention.job.read");
    if (link.id === "requests") return allowed.has("privacy.request.read") || allowed.has("privacy.audit.read");
    if (link.id === "telemetry") return allowed.has("privacy.telemetry.read") || allowed.has("privacy.alert.read");
    if (link.id === "audit" || link.id === "analytics" || link.id === "population" || link.id === "research" || link.id === "evaluation" || link.id === "release-train" || link.id === "modules") return allowed.has("security.audit.read");
    if (link.id === "marketplace") return allowed.has("billing.read") || allowed.has("security.audit.read");
    if (link.id === "revenue" || link.id === "enterprise") return allowed.has("billing.read");
    if (link.id === "tenancy" || link.id === "gateway") return allowed.has("organization.read") || allowed.has("facility.read");
    if (link.id === "patients") return allowed.has("patient.read") || allowed.has("clinical.read");
    if (link.id === "practitioners") return allowed.has("practitioner.read");
    if (link.id === "appointments") return allowed.has("appointment.read");
    if (link.id === "clinical") return allowed.has("clinical.condition.read") || allowed.has("clinical.observation.read");
    if (link.id === "work") return allowed.has("work.pending.read") || allowed.has("work.order.read");
    if (link.id === "billing") return !!ctx.facilityId && allowed.has("billing.charge.read");
    return allowed.has("clinical.read");
  });
  const groups = [...new Set(links.map((link) => link.group))];
  const home = "/dashboard";
  return (
    <div className={`shell${compactMobile ? " compact-mobile" : ""}`}>
      <Sidebar brand={<Brand href={home} light />}>
        {chart ? (
          <form className="side-search" action="/patients" method="get">
            <label className="sr" htmlFor="side-q">
              Search patients
            </label>
            <input id="side-q" name="q" type="search" placeholder="Find a patient…" />
          </form>
        ) : null}
        <nav className="nav" aria-label="Workspace">
          {groups.map((group) => (
            <div key={group}>
              <p className="nav-label">{group}</p>
              {links
                .filter((link) => link.group === group)
                .map((link) => (
                  <a key={link.id} href={link.href} aria-current={link.id === current ? "page" : undefined}>
                    <Icon name={link.icon} size={17} />
                    {link.label}
                  </a>
                ))}
            </div>
          ))}
        </nav>
        <a className="nav-settings" href="/account" aria-current={current === "account" ? "page" : undefined}>
          <Icon name="sliders" size={17} />
          Account & workspace
        </a>
      </Sidebar>
      <div className="workspace">
        <header className="topbar">
          <div className="workspace-heading"><span className="workspace-heading-label">CARE WORKSPACE</span><h1>{title ?? TITLES[current]}</h1></div>
          <div className="top-actions">
            {chart ? (
              <a className="bell" href="/clinical" aria-label="Open clinical workspace">
                <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z" />
                  <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M10 20a2 2 0 0 0 4 0" />
                </svg>
              </a>
            ) : null}
            <AccountMenu
              name={ctx.displayName}
              role={roleLabel(ctx.role)}
              facility={ctx.facilityName ?? ctx.organizationName}
              purpose={purposeLabel(ctx.purposeOfUse)}
            />
          </div>
        </header>
        <main className="main" id="content">
          {children}
        </main>
      </div>
    </div>
  );
}
