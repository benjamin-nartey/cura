import { getDb, reviewListing } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  const decision = String(form.get("decision") ?? "");
  try {
    reviewListing(getDb(), ctx, { listingId: String(form.get("listingId") ?? ""), decision, idempotencyKey: formId(form.get("idempotencyKey")) });
    return redirectTo(request, "/marketplace", { notice: "mktreviewed" });
  } catch (error) {
    return redirectTo(request, "/marketplace", { error: failureCode(error) });
  }
}
