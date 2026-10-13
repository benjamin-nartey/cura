"use client";

import { useEffect, useRef, useState } from "react";

export function AccountMenu({
  name,
  role,
  facility,
  purpose,
}: {
  name: string;
  role: string;
  facility: string;
  purpose: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");

  useEffect(() => {
    function close(event: MouseEvent) {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="account" ref={root}>
      <button className="avatar" type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((value) => !value)}>
        <span>{initials || "CS"}</span>
        <span className="avatar-caret" aria-hidden="true" />
      </button>
      {open ? (
      <div className="account-menu" role="menu">
          <p className="account-name">{name}</p>
          <p className="muted">
            {role} · {facility}
          </p>
          <p className="muted">Purpose of use · {purpose}</p>
          <a role="menuitem" href="/account" onClick={() => setOpen(false)}>
            Account settings
          </a>
          <a role="menuitem" href="/worklist" onClick={() => setOpen(false)}>
            Worklist
          </a>
          <a role="menuitem" href="/patients" onClick={() => setOpen(false)}>
            Patients
          </a>
          <form action="/api/session/end" method="post">
            <button role="menuitem" type="submit">
              Sign out
            </button>
          </form>
      </div>
      ) : null}
    </div>
  );
}
