import { getDb, healthcheck } from "@curasphere/domain";
import { NextResponse } from "next/server";
import { readFoundationHealth } from "@/lib/foundation";

export async function GET() {
  const body = healthcheck(getDb());
  const foundation = await readFoundationHealth();
  return NextResponse.json({ ...body, foundation }, { headers: { "cache-control": "no-store" } });
}
