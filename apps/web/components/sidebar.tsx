"use client";

import { useState, type ReactNode } from "react";

export function Sidebar({ brand, children }: { brand: ReactNode; children: ReactNode }) {
  const [expanded, setExpanded] = useState(false);
  return <aside className="side" id="workspace-navigation" tabIndex={-1} data-expanded={expanded}>
    <div className="sidebar-heading">{brand}<button className="sidebar-toggle" type="button" aria-label={expanded ? "Close navigation" : "Open navigation"} aria-expanded={expanded} aria-controls="workspace-navigation-content" onClick={() => setExpanded(value => !value)}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d={expanded ? "M6 6l12 12M6 18 18 6" : "M4 6h16M4 12h16M4 18h16"} /></svg>
    </button></div>
    <div className="sidebar-content" id="workspace-navigation-content" onClick={event => { if ((event.target as Element).closest("a[href]")) setExpanded(false); }}>{children}</div>
  </aside>;
}
