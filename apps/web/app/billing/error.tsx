"use client";

export default function BillingError() {
  return <main id="content"><h1>Billing unavailable</h1><p role="alert">Financial records could not load. No successful write is confirmed by this screen. Retry the original submission only after checking its current status.</p><button type="button" onClick={() => window.location.reload()}>Reload billing</button></main>;
}
