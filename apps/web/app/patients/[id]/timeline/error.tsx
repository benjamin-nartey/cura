"use client";
export default function Error({reset}:{reset:()=>void}){return <div role="alert"><p>The timeline could not load.</p><button className="btn-line" onClick={reset}>Retry timeline</button></div>;}
