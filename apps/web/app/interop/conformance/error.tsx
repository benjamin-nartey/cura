"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="content" tabIndex={-1}><h1>Conformance unavailable</h1><p role="alert">Restore the service and retry the published artifacts.</p><button className="btn-line" onClick={reset}>Retry conformance</button></main>;}
