import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { runGoogleCuratedDiscovery } from "@/lib/location-growth/googleCuratedDiscovery";
import { publishCuratedGoogleCandidates } from "@/lib/location-growth/googleCuratedPublisher";
import type { GoogleDiscoveryKind } from "@/lib/location-growth/googleDiscoveryQuality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function bounded(value: string | null, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  const kind: GoogleDiscoveryKind =
    request.nextUrl.searchParams.get("kind") === "activity" ? "activity" : "restaurant";
  const maxPlans = bounded(request.nextUrl.searchParams.get("maxPlans"), 6, 1, 10);
  const resultsPerPlan = bounded(request.nextUrl.searchParams.get("resultsPerPlan"), 8, 1, 12);
  const maxCandidates = bounded(request.nextUrl.searchParams.get("maxCandidates"), 40, 1, 80);

  return runTrackedCron({
    jobKey: `curated-location-discovery-${kind}`,
    jobName: `Curated ${kind === "restaurant" ? "Restaurant" : "Activity"} Discovery`,
    routePath: "/api/cron/location-discovery",
    description:
      "Gap-driven Google Places discovery. Candidates are quality-scored, staged, photo-cached, and only high-confidence rows are published.",
    scheduleHint:
      kind === "restaurant"
        ? "Daily at 3:00 AM UTC via Vercel Cron."
        : "Daily at 3:30 AM UTC via Vercel Cron.",
    handler: async () => {
      const discovery = await runGoogleCuratedDiscovery({
        kind,
        maxPlans,
        resultsPerPlan,
        maxCandidates,
        maxRuntimeMs: 150_000,
        autoPublish: false,
      });
      const publisher = discovery.counts.autoImport > 0
        ? await publishCuratedGoogleCandidates({
            batchId: discovery.batchId,
            limit: discovery.counts.autoImport,
          })
        : null;
      const result = {
        ...discovery,
        counts: {
          ...discovery.counts,
          published: publisher?.published || 0,
          photosCached: publisher?.cached || 0,
          downgradedToReview: publisher?.downgradedToReview || 0,
        },
        publisher,
      };

      return {
        message: `Curated ${kind} discovery completed.`,
        details: {
          action: "curated_location_discovery",
          batchId: result.batchId,
          kind,
          counts: result.counts,
          plans: result.plans,
          errors: [
            ...result.errors,
            ...(publisher?.cacheErrors || []),
            ...(publisher?.publishErrors || []),
          ].slice(0, 20),
        },
        response: NextResponse.json(result),
      };
    },
  });
}
