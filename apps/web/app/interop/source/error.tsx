"use client";
export default function SourceError({reset}:{reset:()=>void}){return <main><h1>Source preview unavailable</h1><p>Restore the connection and retry. No source changes were applied.</p><button className="btn-dark" onClick={reset}>Retry source preview</button></main>;}
