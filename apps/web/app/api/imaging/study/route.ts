import { getDb, recordImagingStudy } from "@curasphere/domain";
import { currentSession, failureCode, formId, redirectTo } from "@/lib/http";

export async function POST(request: Request) {
  const ctx = await currentSession();
  if (!ctx) return redirectTo(request, "/");
  const form = await request.formData();
  try {
    recordImagingStudy(getDb(), ctx, {
      patientId: String(form.get("patientId") ?? ""),
      accession: String(form.get("accession") ?? ""),
      modality: String(form.get("modality") ?? ""),
      description: String(form.get("description") ?? ""),
      studyDate: String(form.get("studyDate") ?? ""),
      idempotencyKey: formId(form.get("idempotencyKey")),
    });
    return redirectTo(request, "/imaging", { notice: "imgstudy" });
  } catch (error) {
    return redirectTo(request, "/imaging", { error: failureCode(error) });
  }
}
