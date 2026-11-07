"use client";
export default function AppsError({reset}:{reset:()=>void}){return <main id="content" tabIndex={-1}><h1>Application access unavailable</h1><p>Restore the dependency and retry. No new clinical access is assumed.</p><button className="btn-dark" onClick={reset}>Retry applications</button></main>;}
