import { downloadExport, getDb } from "@curasphere/domain";
import { privacyActor, privacyFailure, requirePrivacySession } from "@/lib/privacy";
import { redirectTo } from "@/lib/http";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requirePrivacySession();
  const { id } = await context.params;
  if (!ctx) return redirectTo(request, "/", { error: "signin" });
  try {
    const result = downloadExport(getDb(), privacyActor(ctx), id);
    return redirectTo(request, `/privacy/exports/${id}`, { notice: "downloaded", count: String(result.count) });
  } catch (error) {
    return privacyFailure(request, error, `/privacy/exports/${id}`);
  }
}
