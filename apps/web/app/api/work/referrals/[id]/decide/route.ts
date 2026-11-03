import { decideWorkReferral, getDb } from "@curasphere/domain";
import { sourceError, sourceKey } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await context.params;
  const form = await request.formData();
  const expectedVersion = String(form.get("expectedVersion") ?? "");
  const decision = String(form.get("decision") ?? "");
  try {
    decideWorkReferral(getDb(), masterActor(ctx), id, { expectedVersion: Number(expectedVersion), decision, idempotencyKey: sourceKey(["work-decide", id, expectedVersion, decision]) });
    return redirectTo(request, `/work/referrals/${id}`, { notice: "referral-decided" });
  } catch (error) {
    return redirectTo(request, `/work/referrals/${id}`, { error: sourceError(error) });
  }
}
