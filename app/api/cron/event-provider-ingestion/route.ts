import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { runEventProviderIngestion } from "@/lib/events/ingestion";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  return runTrackedCron({
    jobKey: "event-provider-ingestion",
    jobName: "Event Provider Ingestion",
    routePath: "/api/cron/event-provider-ingestion",
    description: "Imports bounded Ticketmaster, NYC Events, and NYC Parks inventory into canonical Events.",
    scheduleHint: "Daily via Vercel Cron.",
    handler: async () => {
      const result = await runEventProviderIngestion();
      return {
        message: result.success
          ? "Event provider ingestion completed."
          : "Event provider ingestion completed with provider errors.",
        details: {
          action: "event_provider_ingestion",
          counts: result.counts,
          providers: result.providers,
        },
        response: NextResponse.json({
          success: result.success,
          action: "event_provider_ingestion",
          counts: result.counts,
          providers: result.providers,
          configuredProviders: result.configuredProviders,
        }, { status: result.success ? 200 : 207 }),
      };
    },
  });
}
