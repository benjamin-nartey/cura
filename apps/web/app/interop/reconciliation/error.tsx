"use client";
export default function ErrorPage({reset}:{reset:()=>void}){return <main id="content" tabIndex={-1}><h1>Reconciliation unavailable</h1><p role="alert">Restore the connection, then reload the durable cursor before retrying.</p><button onClick={reset}>Retry reconciliation</button></main>;}
