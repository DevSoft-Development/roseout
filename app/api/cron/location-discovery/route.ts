import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { runGoogleCuratedDiscovery } from "@/lib/location-growth/googleCuratedDiscovery";
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
      "Gap-driven Google Places discovery. Candidates are quality-scored into auto-import, review, or rejection before controlled publishing.",
    scheduleHint:
      kind === "restaurant"
        ? "Daily at 3:00 AM UTC via Vercel Cron."
        : "Daily at 3:30 AM UTC via Vercel Cron.",
    handler: async () => {
      const result = await runGoogleCuratedDiscovery({
        kind,
        maxPlans,
        resultsPerPlan,
        maxCandidates,
        maxRuntimeMs: 240_000,
        autoPublish: true,
      });

      return {
        message: `Curated ${kind} discovery completed.`,
        details: {
          action: "curated_location_discovery",
          batchId: result.batchId,
          kind,
          counts: result.counts,
          plans: result.plans,
          errors: result.errors,
        },
        response: NextResponse.json(result),
      };
    },
  });
}
