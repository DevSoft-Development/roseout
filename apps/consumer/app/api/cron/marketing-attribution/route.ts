import { NextRequest, NextResponse } from "next/server";
import { syncMarketingAttributionFromAnalytics } from "@/lib/marketing/attribution";
import { syncCanonicalAttribution } from "@/lib/marketing/canonical-attribution";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  return Boolean(secret) && request.headers.get("authorization") === `Bearer ${secret}`;
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [legacy, canonical] = await Promise.all([
      syncMarketingAttributionFromAnalytics(),
      syncCanonicalAttribution({ lookbackHours: 24 * 35 }),
    ]);
    return NextResponse.json({ ok: true, legacy, canonical });
  } catch (error) {
    return NextResponse.json({ ok: false, error: error instanceof Error ? error.message : "Marketing attribution sync failed." }, { status: 500 });
  }
}
