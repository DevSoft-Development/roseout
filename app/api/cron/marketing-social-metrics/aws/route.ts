import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { ingestSocialMetrics } from "@/lib/marketing/social-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  try {
    const result = await ingestSocialMetrics();
    return NextResponse.json({
      ok: true,
      action: "marketing_social_metrics",
      degraded: result.errors > 0,
      ...result,
    });
  } catch (error) {
    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "social_metrics_sync_failed",
      },
      { status: 500 },
    );
  }
}
