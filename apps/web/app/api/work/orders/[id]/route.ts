import { redirectTo } from "@/lib/http";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return redirectTo(request, `/work/orders/${id}`);
}
