import { assignTask, getDb } from "@curasphere/domain";
import { sourceError, sourceKey } from "@/lib/clinical";
import { redirectTo } from "@/lib/http";
import { masterActor } from "@/lib/master";
import { requireSession } from "@/lib/session";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ctx = await requireSession();
  const { id } = await context.params;
  const form = await request.formData();
  const expectedVersion = String(form.get("expectedVersion") ?? "");
  const assigneeUserId = String(form.get("assigneeUserId") ?? "");
  try {
    assignTask(getDb(), masterActor(ctx), id, { expectedVersion: Number(expectedVersion), assigneeUserId, idempotencyKey: sourceKey(["work-assign", id, expectedVersion, assigneeUserId]) });
    return redirectTo(request, "/work", { notice: "task-assigned" });
  } catch (error) {
    return redirectTo(request, "/work", { error: sourceError(error) });
  }
}
