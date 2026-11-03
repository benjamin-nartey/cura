export function Brand({ href = "/", light = false }: { href?: string; light?: boolean }) {
  return <a className={`premium-brand${light ? " light" : ""}`} href={href} aria-label="CuraSphere home">
    <svg viewBox="0 0 40 40" width="36" height="36" fill="none" aria-hidden="true">
      <rect width="40" height="40" rx="12" fill="currentColor" />
      <path d="M20 10v20M10 20h20" stroke={light ? "#123f3d" : "#fff"} strokeWidth="4" strokeLinecap="round" />
      <circle cx="29" cy="11" r="3" fill="#d9b776" />
    </svg><span>CuraSphere<span className="brand-period">.</span></span>
  </a>;
}
