import {PageHeader} from "@/components/page-workspace";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { PasskeyPanel } from "@/components/passkey-panel";
import { optionalSession } from "@/lib/session";

export default async function PasskeyPage() {
  const jar = await cookies();
  const pending = jar.get("cura_mfa")?.value;
  const session = await optionalSession();
  if (!pending && !session) redirect("/");
  const mode = session ? "register" : "authenticate";
  return (
    <main className="gate" id="content">
      <section className="panel card">
        <p className="eyebrow">Passkey</p>
        <PageHeader section="Account security" href="/login" icon="shieldCheck">        <h1>{mode === "register" ? "Register a passkey" : "Sign in with a passkey"}</h1></PageHeader>
        <p className="lede">The authenticator must sign a challenge from this server. A cancelled prompt does not create a session.</p>
        <PasskeyPanel mode={mode} />
      </section>
    </main>
  );
}
