"use client";
export default function Error({reset}:{reset:()=>void}){return <div role="alert"><p>Timeline explorer is unavailable.</p><button className="btn-line" onClick={reset}>Retry explorer</button></div>;}
