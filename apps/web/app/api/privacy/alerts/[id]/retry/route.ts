import { getDb, retryAlertDelivery } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requirePrivacySession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  const form = await request.formData();
  try {
    retryAlertDelivery(getDb(), privacyActor(ctx), id, Number(form.get("expectedVersion") ?? "0"));
    return redirectTo(request, `/privacy/alerts/${id}`, { notice: "delivered" });
  } catch (error) {
    return privacyFailure(request, error, `/privacy/alerts/${id}`);
  }
}
