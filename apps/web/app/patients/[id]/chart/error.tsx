"use client";

export default function ChartError() {
  return <main id="content"><h1>Chart unavailable</h1><p role="alert">Source records could not load. Check your connection and retry before continuing the visit.</p><button type="button" onClick={() => window.location.reload()}>Reload chart</button><p><a href="/patients">Return to patient search</a></p></main>;
}
