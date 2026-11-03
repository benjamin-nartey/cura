"use client";

import { useEffect, useState } from "react";

export function EmergencyActive({
  grantId,
  resourceName,
  summary,
  expiresAt,
  requestId,
}: {
  grantId: string;
  resourceName: string;
  summary: string;
  expiresAt: string;
  requestId: string;
}) {
  const [content, setContent] = useState(summary);
  const [remaining, setRemaining] = useState("");

  useEffect(() => {
    const timer = window.setInterval(() => {
      const left = Date.parse(expiresAt) - Date.now();
      if (left <= 0) {
        setContent("");
        window.location.assign("/emergency/ended?reason=expired");
        return;
      }
      const minutes = Math.floor(left / 60000);
      const seconds = Math.floor((left % 60000) / 1000);
      setRemaining(`${minutes} minutes ${seconds} seconds`);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  useEffect(() => {
    const probe = window.setInterval(async () => {
      const response = await fetch("/api/emergency-access/current");
      if (!response.ok) {
        setContent("");
        window.location.assign("/emergency/ended?reason=ended");
      }
    }, 5000);
    return () => window.clearInterval(probe);
  }, []);

  return (
    <section className="panel card" aria-labelledby="emergency-banner">
      <p id="emergency-banner" role="status">
        <strong>Emergency Access Active</strong>
        <span className="sr"> Temporary read-only access. The server ends this access at the expiry time.</span>
      </p>
      <p>Scope: read-only simulation record {resourceName}</p>
      <p>Remaining duration: {remaining || "Checking the server expiry"}</p>
      <p>Grant expiry: {expiresAt}</p>
      <p>Request reference: {requestId}</p>
      {content ? <p>{content}</p> : <p>The restricted record has been cleared.</p>}
      <form method="post" action={`/api/emergency-access/grants/${grantId}/revoke`}>
        <button type="submit">End Emergency Access</button>
      </form>
    </section>
  );
}
