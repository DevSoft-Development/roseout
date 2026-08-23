import { NextRequest, NextResponse } from "next/server";
import { ingestSocialMetrics } from "@/lib/marketing/social-metrics";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const result = await ingestSocialMetrics();
    return NextResponse.json({ ok: result.errors === 0, ...result });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Social metrics sync failed." }, { status: 500 });
  }
}
