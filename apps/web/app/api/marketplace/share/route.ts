import { getDb, recordShare } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordShare(getDb(), ctx, {
      listingId: String(form.get("listingId") ?? ""),
      amount: String(form.get("amount") ?? ""),
      percent: String(form.get("percent") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/marketplace", { notice: "mktshare" });
  } catch (error) {
    return redirectTo(request, "/marketplace", { error: failureCode(error) });
  }
}
