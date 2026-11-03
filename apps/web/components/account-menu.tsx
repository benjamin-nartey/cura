"use client";

import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { Icon } from "./icon";

export function AccountMenu({ name, role, facility, purpose }: { name: string; role: string; facility: string; purpose: string }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const focusLast = useRef(false);
  const id = useId();
  const initials = name.split(" ").filter(Boolean).slice(0,2).map(part => part[0]?.toUpperCase() ?? "").join("");
  const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []);
  useEffect(() => {
    if (open) { const list = items(); (focusLast.current ? list.at(-1) : list[0])?.focus(); }
  }, [open]);
  useEffect(() => {
    function outside(event: PointerEvent) { if (!root.current?.contains(event.target as Node)) setOpen(false); }
    document.addEventListener("pointerdown", outside);
    return () => document.removeEventListener("pointerdown", outside);
  }, []);
  function keydown(event: KeyboardEvent<HTMLDivElement>) {
    if (!open) return;
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") { event.preventDefault(); setOpen(false); trigger.current?.focus(); }
    else if (event.key === "Tab") { setOpen(false); trigger.current?.focus(); }
    else if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const next = event.key === "Home" ? 0 : event.key === "End" ? list.length - 1 : (index + (event.key === "ArrowDown" ? 1 : -1) + list.length) % list.length;
      list[next]?.focus();
    }
  }
  return <div className="account" ref={root} onKeyDown={keydown} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}>
    <button ref={trigger} id={`${id}-trigger`} className="avatar" type="button" aria-haspopup="menu" aria-expanded={open} aria-controls={open ? `${id}-menu` : undefined} onClick={() => { focusLast.current = false; setOpen(value => !value); }} onKeyDown={event => {
      if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); event.stopPropagation(); focusLast.current = event.key === "ArrowUp"; setOpen(true); }
    }}>
      <span aria-hidden="true">{initials || "CS"}</span><span className="account-trigger-copy" aria-hidden="true"><strong>{name}</strong>{" "}<small>{role}</small></span><span className="avatar-caret" aria-hidden="true" /><span className="sr">Account menu for {name} {role}</span>
    </button>
    {open ? <div className="account-menu"><div className="account-menu-profile"><p className="account-name">{name}</p><p className="muted">{role} · {facility}</p><p className="muted">Purpose · {purpose}</p></div><div role="menu" id={`${id}-menu`} aria-labelledby={`${id}-trigger`}>
      <a role="menuitem" tabIndex={-1} href="/account"><Icon name="sliders" />Account & workspace</a>
      <a role="menuitem" tabIndex={-1} href="/worklist"><Icon name="checklist" />Worklist</a>
      <a role="menuitem" tabIndex={-1} href="/patients"><Icon name="users" />Patients</a>
      <form action="/api/session/end" method="post"><button role="menuitem" tabIndex={-1} type="submit"><Icon name="logout" />Sign out</button></form>
    </div></div> : null}
  </div>;
}
