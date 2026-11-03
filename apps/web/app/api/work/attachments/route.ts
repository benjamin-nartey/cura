import { addAttachment, getDb } from "@curasphere/domain";
import { sourceError, sourceKey } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request) {
  const ctx = await requireSession();
  const form = await request.formData();
  const parentKind = String(form.get("parentKind") ?? "");
  const parentId = String(form.get("parentId") ?? "");
  const code = String(form.get("code") ?? "");
  const sha256 = String(form.get("sha256") ?? "");
  try {
    addAttachment(getDb(), masterActor(ctx), {
      parentKind,
      parentId,
      code,
      byteLength: Number(form.get("byteLength") ?? 0),
      sha256,
      idempotencyKey: sourceKey(["work-file", parentKind, parentId, code, sha256.slice(0, 12)]),
    });
    const path = parentKind === "referral" ? `/work/referrals/${parentId}` : parentKind === "plan" ? `/work/plans/${parentId}` : `/work/orders/${parentId}`;
    return redirectTo(request, path, { notice: "attachment-saved" });
  } catch (error) {
    return redirectTo(request, "/work", { error: sourceError(error) });
  }
}
