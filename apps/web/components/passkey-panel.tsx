"use client";

import { startAuthentication, startRegistration } from "@simplewebauthn/browser";
import { useState } from "react";

export function PasskeyPanel({ mode }: { mode: "register" | "authenticate" }) {
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    setMessage(null);
    try {
      if (!window.PublicKeyCredential) {
        setMessage("This browser does not support passkeys.");
        return;
      }
      const started = await fetch(`/api/auth/passkey/${mode}/options`, { method: "POST" });
      if (!started.ok) {
        setMessage("The passkey challenge could not be started.");
        return;
      }
      const body = (await started.json()) as { challengeId: string; options: Record<string, unknown> };
      const credential =
        mode === "register"
          ? await startRegistration({ optionsJSON: body.options as never })
          : await startAuthentication({ optionsJSON: body.options as never });
      const verified = await fetch(`/api/auth/passkey/${mode}/verify`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ challengeId: body.challengeId, response: credential }),
      });
      if (!verified.ok) {
        setMessage("The passkey was not accepted.");
        return;
      }
      if (mode === "authenticate") window.location.assign("/dashboard");
      else setMessage("The passkey is enrolled.");
    } catch (error) {
      const name = error instanceof Error ? error.name : "";
      const detail = error instanceof Error ? error.message : "";
      if (name === "NotAllowedError") setMessage("The passkey prompt was cancelled.");
      else if (detail.includes("invalid domain")) setMessage("This address cannot register a passkey. Open localhost.");
      else setMessage("The passkey could not be verified.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="form-grid">
      <button className="btn-dark" type="button" onClick={() => void run()} disabled={busy}>
        {busy ? "Waiting for the authenticator" : mode === "register" ? "Register a passkey" : "Use a passkey"}
      </button>
      {message ? (
        <p role="status" className={message === "The passkey is enrolled." ? "form-ok" : "form-error"}>
          {message}
        </p>
      ) : null}
    </div>
  );
}
