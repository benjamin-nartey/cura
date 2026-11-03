"use client";

import { startAuthentication } from "@simplewebauthn/browser";
import { useState } from "react";

export function EmergencyPasskey({ requestId }: { requestId: string }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      const started = await fetch(`/api/emergency-access/requests/${requestId}/passkey`, { method: "POST" });
      if (!started.ok) {
        setMessage("Identity verification is unavailable.");
        return;
      }
      const body = (await started.json()) as { challengeId: string; options: Record<string, unknown> };
      const credential = await startAuthentication({ optionsJSON: body.options as never });
      const verified = await fetch(`/api/emergency-access/requests/${requestId}/passkey`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: body.challengeId, response: credential }),
      });
      if (!verified.ok) {
        setMessage("The passkey was not accepted.");
        return;
      }
      window.location.assign("/emergency/active");
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      if (name === "NotAllowedError") setMessage("The passkey prompt was cancelled.");
      else setMessage("The passkey could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-grid">
      <button className="btn-dark" type="button" onClick={() => void run()} disabled={busy}>
        {busy ? "Waiting for the authenticator" : "Verify with a passkey"}
      </button>
      {message ? <p role="alert">{message}</p> : null}
    </div>
  );
}
