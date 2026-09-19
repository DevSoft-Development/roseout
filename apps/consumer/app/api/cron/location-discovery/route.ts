import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { runGoogleCuratedDiscovery } from "@/lib/location-growth/googleCuratedDiscovery";
import { publishCuratedGoogleCandidates } from "@/lib/location-growth/googleCuratedPublisher";
import { promoteStoredGoogleReviewCandidates } from "@/lib/location-growth/googleReviewPromotion";
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
  const maxPlans = bounded(request.nextUrl.searchParams.get("maxPlans"), 8, 1, 10);
  const resultsPerPlan = bounded(request.nextUrl.searchParams.get("resultsPerPlan"), 10, 1, 12);
  const maxCandidates = bounded(request.nextUrl.searchParams.get("maxCandidates"), 60, 1, 80);
  const reviewRecoveryLimit = bounded(request.nextUrl.searchParams.get("reviewRecoveryLimit"), 200, 1, 500);
  const publish = request.nextUrl.searchParams.get("publish") !== "false";

  return runTrackedCron({
    jobKey: `curated-location-discovery-${kind}`,
    jobName: `Curated ${kind === "restaurant" ? "Restaurant" : "Activity"} Discovery`,
    routePath: "/api/cron/location-discovery",
    description:
      "Local-gap Google Places discovery with core coverage plus curated finds. Existing stored review candidates are re-evaluated first without Google API calls, then new candidates are quality-scored, staged, enriched, and only high-confidence rows are published.",
    scheduleHint:
      kind === "restaurant"
        ? "Daily at 6:30 AM UTC (2:30 AM Eastern during EDT) via Vercel Cron."
        : "Daily at 7:00 AM UTC (3:00 AM Eastern during EDT) via Vercel Cron.",
    handler: async () => {
      // Drain eligible already-paid-for review inventory before spending on new
      // Google discovery. The recovery pass uses stored staging/raw_payload only.
      const storedReviewRecovery = publish
        ? await promoteStoredGoogleReviewCandidates({
            limit: reviewRecoveryLimit,
            publish: true,
            locationType: kind,
          })
        : null;

      const discovery = await runGoogleCuratedDiscovery({
        kind,
        maxPlans,
        resultsPerPlan,
        maxCandidates,
        maxRuntimeMs: 150_000,
        autoPublish: false,
      });
      const publishablePool = discovery.counts.autoImport + discovery.counts.review;
      const publisher = publish && publishablePool > 0
        ? await publishCuratedGoogleCandidates({
            batchId: discovery.batchId,
            limit: publishablePool,
          })
        : null;
      const result = {
        ...discovery,
        publishRequested: publish,
        storedReviewRecovery,
        counts: {
          ...discovery.counts,
          published: publisher?.published || 0,
          photosPrepared: publisher?.photosPrepared || 0,
          reservationLinksFound: publisher?.reservations?.found || 0,
          reservationLinksChecked: publisher?.reservations?.checked || 0,
          downgradedToReview: publisher?.downgradedToReview || 0,
          storedReviewsScanned: storedReviewRecovery?.scanned || 0,
          storedReviewsPromoted: storedReviewRecovery?.promoted || 0,
          storedReviewsPublished: storedReviewRecovery?.markedPublished || 0,
          storedReviewGoogleApiCalls: storedReviewRecovery?.googleApiCalls || 0,
        },
        publisher,
      };

      return {
        message: `Curated ${kind} discovery completed${publish ? "" : " in staging-only mode"}.`,
        details: {
          action: "curated_location_discovery",
          batchId: result.batchId,
          kind,
          publishRequested: publish,
          counts: result.counts,
          plans: result.plans,
          errors: [
            ...(storedReviewRecovery?.errors || []),
            ...result.errors,
            ...(publisher?.cacheErrors || []),
            ...(publisher?.publishErrors || []),
            ...(publisher?.reservations?.errors || []),
          ].slice(0, 20),
        },
        response: NextResponse.json(result),
      };
    },
  });
}
