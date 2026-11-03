import { getDb, listCodeSystemReleases, registerCodeSystemRelease } from "@curasphere/domain";
import { releaseBody, terminologyCaller, terminologyFailure, terminologyJson, terminologySameOrigin } from "@/lib/terminology-registry";
export async function GET(request: Request) {
  const ctx = await terminologyCaller();
  if (!ctx) return terminologyJson({ error: "signin" },401);
  try { return terminologyJson({ contractVersion:1, releases:listCodeSystemReleases(getDb(),ctx,new URL(request.url).searchParams.get("q") ?? ""), limit:100 }); } catch(error) { return terminologyFailure(error); }
}
export async function POST(request: Request) {
  if (!terminologySameOrigin(request)) return terminologyJson({ error:"forbidden" },403);
  const ctx = await terminologyCaller();
  if (!ctx) return terminologyJson({ error:"signin" },401);
  try { const result=registerCodeSystemRelease(getDb(),ctx,await releaseBody(request));return terminologyJson({ contractVersion:1,...result },result.replayed?200:201); } catch(error) { return terminologyFailure(error); }
}
