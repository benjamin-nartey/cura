"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="content" tabIndex={-1}><h1>Partner exchange is unavailable</h1><p role="alert">Restore your connection and retry. Check the queue before resubmitting an import.</p><button onClick={reset}>Retry partner exchange</button></main>;}
