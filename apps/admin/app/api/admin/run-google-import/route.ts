import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { runGoogleCuratedDiscovery } from "@/lib/location-growth/googleCuratedDiscovery";
import { publishCuratedGoogleCandidates } from "@/lib/location-growth/googleCuratedPublisher";
import { promoteStoredGoogleReviewCandidates } from "@/lib/location-growth/googleReviewPromotion";
import type { GoogleDiscoveryKind } from "@/lib/location-growth/googleDiscoveryQuality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function authorize(request: NextRequest) {
  if (process.env.NODE_ENV === "development") return null;
  if (
    process.env.IMPORT_SECRET &&
    request.headers.get("x-internal-import-secret") === process.env.IMPORT_SECRET
  ) {
    return null;
  }
  const { error } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.locationGrowth);
  return error;
}

function bounded(value: unknown, fallback: number, min: number, max: number) {
  const numeric = Number(value ?? fallback);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(numeric)));
}

function normalizeKinds(value: unknown): GoogleDiscoveryKind[] {
  const raw = String(value || "both").toLowerCase();
  if (raw === "activity" || raw === "activities") return ["activity"];
  if (raw === "restaurant" || raw === "restaurants") return ["restaurant"];
  return ["restaurant", "activity"];
}

async function runCanonicalImport(input: Record<string, unknown>) {
  const kinds = normalizeKinds(input.type ?? input.kind);
  const autoPublish = input.autoPublish !== false;
  const maxPlans = bounded(input.maxPlans ?? input.maxQueries, 6, 1, 10);
  const resultsPerPlan = bounded(input.resultsPerPlan ?? input.limit, 8, 1, 12);
  const maxCandidates = bounded(input.maxCandidates, 40, 1, 80);
  const maxRuntimeMs = bounded(input.maxRuntimeMs, 150_000, 30_000, 180_000);

  // Recover already-paid-for Google review candidates first. This uses only
  // stored staging/raw_payload evidence and intentionally makes zero Google API
  // calls. Rows still requiring human review remain untouched.
  const storedReviewRecovery = autoPublish
    ? await promoteStoredGoogleReviewCandidates({
        limit: bounded(input.reviewRecoveryLimit, 200, 1, 500),
        publish: true,
      })
    : null;

  const runs = [];
  for (const kind of kinds) {
    const discovery = await runGoogleCuratedDiscovery({
      kind,
      maxPlans,
      resultsPerPlan,
      maxCandidates,
      maxRuntimeMs,
      autoPublish: false,
    });
    const publishablePool = discovery.counts.autoImport + discovery.counts.review;
    const publisher = autoPublish && publishablePool > 0
      ? await publishCuratedGoogleCandidates({
          batchId: discovery.batchId,
          limit: publishablePool,
        })
      : null;
    runs.push({
      ...discovery,
      counts: {
        ...discovery.counts,
        published: publisher?.published || 0,
        photosPrepared: publisher?.photosPrepared || 0,
        reservationLinksFound: publisher?.reservations?.found || 0,
        reservationLinksChecked: publisher?.reservations?.checked || 0,
        downgradedToReview: publisher?.downgradedToReview || 0,
      },
      publisher,
    });
  }

  const totals = runs.reduce(
    (acc, run) => {
      for (const [key, value] of Object.entries(run.counts || {})) {
        if (typeof value === "number") acc[key] = (acc[key] || 0) + value;
      }
      return acc;
    },
    {} as Record<string, number>,
  );

  return {
    success: true,
    pipeline: "google_curated_discovery",
    legacyImporterRemoved: true,
    storedReviewRecovery,
    runs,
    counts: {
      ...totals,
      storedReviewsScanned: storedReviewRecovery?.scanned || 0,
      storedReviewsPromoted: storedReviewRecovery?.promoted || 0,
      storedReviewsPublished: storedReviewRecovery?.markedPublished || 0,
      storedReviewGoogleApiCalls: storedReviewRecovery?.googleApiCalls || 0,
    },
  };
}

export async function POST(request: NextRequest) {
  const authError = await authorize(request);
  if (authError) return authError;
  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    return NextResponse.json(await runCanonicalImport(body));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[run-google-import/curated-compat]", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  const authError = await authorize(request);
  if (authError) return authError;
  try {
    const params = Object.fromEntries(request.nextUrl.searchParams.entries());
    return NextResponse.json(await runCanonicalImport(params));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[run-google-import/curated-compat]", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
