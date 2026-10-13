import type { SessionContext } from "@curasphere/contracts";
import { canReadChart, canReviewAudit } from "@curasphere/domain";
import { AccountMenu } from "@/components/account-menu";
import { Icon, type IconName } from "@/components/icon";
import { listFoundationEncounters } from "@/lib/foundation";
import { purposeLabel, roleLabel } from "@/lib/format";

type LinkId =
  | "dashboard"
  | "facility"
  | "worklist"
  | "patients"
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
  | "marketplace";

const LINKS: ReadonlyArray<{ href: string; id: LinkId; label: string; group: string; icon: IconName }> = [
  { href: "/dashboard", id: "dashboard", label: "Dashboard", group: "Main", icon: "grid" },
  { href: "/facility", id: "facility", label: "Beds and wards", group: "Main", icon: "bed" },
  { href: "/worklist", id: "worklist", label: "Worklist", group: "Main", icon: "checklist" },
  { href: "/patients", id: "patients", label: "Patients", group: "Main", icon: "users" },
  { href: "/coordination", id: "coordination", label: "Coordination", group: "Main", icon: "handoff" },
  { href: "/operations", id: "operations", label: "Operations", group: "Monitoring", icon: "activity" },
  { href: "/interop", id: "interop", label: "Interop", group: "Monitoring", icon: "plug" },
  { href: "/gateway", id: "gateway", label: "Gateway", group: "Monitoring", icon: "shield" },
  { href: "/agents", id: "agents", label: "Agents", group: "Monitoring", icon: "bot" },
  { href: "/imaging", id: "imaging", label: "Imaging", group: "Monitoring", icon: "scan" },
  { href: "/devices", id: "devices", label: "Devices", group: "Monitoring", icon: "heartPulse" },
  { href: "/audit", id: "audit", label: "Audit", group: "Reports", icon: "fileSearch" },
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
  dashboard: "Dashboard",
  facility: "Beds and wards",
  worklist: "Worklist",
  patients: "Patients",
  coordination: "Coordination",
  operations: "Operations",
  interop: "Interop",
  gateway: "Gateway",
  agents: "Agents",
  imaging: "Imaging",
  devices: "Devices",
  audit: "Audit",
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
  children,
}: {
  ctx: SessionContext;
  current: ShellSection;
  title?: string;
  children: React.ReactNode;
}) {
  const links = LINKS.filter((link) => {
    if (link.id === "audit") return canReviewAudit(ctx);
    if (link.id === "analytics" || link.id === "population" || link.id === "research" || link.id === "evaluation" || link.id === "release-train" || link.id === "modules") return ctx.role === "auditor";
    if (link.id === "revenue" || link.id === "enterprise") return ctx.role === "admin";
    if (link.id === "marketplace") return ctx.role === "admin" || ctx.role === "auditor";
    if (link.id === "gateway") return true;
    return canReadChart(ctx);
  });
  const groups = [...new Set(links.map((link) => link.group))];
  let alerts = 0;
  if (canReadChart(ctx)) {
    const open = await listFoundationEncounters(ctx.sessionId);
    alerts = open?.length ?? 0;
  }
  const home = "/dashboard";
  return (
    <div className="shell">
      <aside className="side">
        <a className="brand" href={home}>
          <span className="mark" aria-hidden="true" />
          CuraSphere
        </a>
        {canReadChart(ctx) ? (
          <form className="side-search" action="/patients" method="get">
            <label className="sr" htmlFor="side-q">
              Search patients
            </label>
            <input id="side-q" name="q" type="search" placeholder="Search" />
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
          Settings
        </a>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <h1>{title ?? TITLES[current]}</h1>
          <div className="top-actions">
            {canReadChart(ctx) ? (
              <a className="bell" href="/worklist" aria-label={alerts === 0 ? "No open encounters" : `${alerts} open encounters`}>
                <svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18">
                  <path fill="none" stroke="currentColor" strokeWidth="1.8" d="M6 9a6 6 0 1 1 12 0c0 7 3 7 3 9H3c0-2 3-2 3-9Z" />
                  <path fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" d="M10 20a2 2 0 0 0 4 0" />
                </svg>
                {alerts > 0 ? <span className="bell-count">{alerts}</span> : null}
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
