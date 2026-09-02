import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { ingestSocialMetrics } from "@/lib/marketing/social-metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  return runTrackedCron({
    jobKey: "marketing-social-metrics",
    jobName: "Marketing Social Metrics",
    routePath: "/api/cron/marketing-social-metrics/aws",
    description: "Collects social metrics through AWS while preserving connection-level warnings.",
    handler: async () => {
      const result = await ingestSocialMetrics();
      const body = {
        ok: true,
        action: "marketing_social_metrics",
        degraded: result.errors > 0,
        ...result,
      };
      return {
        message: result.errors > 0
          ? "Marketing social metrics completed with connection warnings."
          : "Marketing social metrics completed.",
        details: body,
        response: NextResponse.json(body),
      };
    },
  });
}
