import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { runGoogleCuratedDiscovery } from "@/lib/location-growth/googleCuratedDiscovery";
import { publishCuratedGoogleCandidates } from "@/lib/location-growth/googleCuratedPublisher";
import type { GoogleDiscoveryKind } from "@/lib/location-growth/googleDiscoveryQuality";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const PREVIEW_BRANCH = "agent/one-time-curated-rerun";
const TOKEN_SHA256 = "9b380f6c758070dabc8feb947e2147dc04d2eff2160e47056abad1abe30fcb3a";

function authorized(request: NextRequest) {
  const env = process.env.VERCEL_ENV || "";
  const branch = process.env.VERCEL_GIT_COMMIT_REF || "";
  const allowedDeployment =
    (env === "preview" && branch === PREVIEW_BRANCH) ||
    (env === "production" && branch === "main");
  if (!allowedDeployment) return false;

  const supplied = request.nextUrl.searchParams.get("token") || "";
  const actual = createHash("sha256").update(supplied).digest();
  const expected = Buffer.from(TOKEN_SHA256, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

function supabaseRef() {
  const value = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  try {
    return new URL(value).hostname.split(".")[0] || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  if (!authorized(request)) {
    return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  }

  if (request.nextUrl.searchParams.get("mode") === "check") {
    return NextResponse.json({
      success: true,
      vercelEnv: process.env.VERCEL_ENV || null,
      branch: process.env.VERCEL_GIT_COMMIT_REF || null,
      supabaseRef: supabaseRef(),
    });
  }

  const kind: GoogleDiscoveryKind =
    request.nextUrl.searchParams.get("kind") === "activity" ? "activity" : "restaurant";

  try {
    const discovery = await runGoogleCuratedDiscovery({
      kind,
      maxPlans: 8,
      resultsPerPlan: 10,
      maxCandidates: 60,
      maxRuntimeMs: 150_000,
      autoPublish: false,
    });

    const publisher = discovery.counts.autoImport > 0
      ? await publishCuratedGoogleCandidates({
          batchId: discovery.batchId,
          limit: discovery.counts.autoImport,
        })
      : null;

    return NextResponse.json({
      success: true,
      kind,
      batchId: discovery.batchId,
      counts: {
        ...discovery.counts,
        published: publisher?.published || 0,
        cached: publisher?.cached || 0,
        reservationLinksFound: publisher?.reservations?.found || 0,
        reservationLinksChecked: publisher?.reservations?.checked || 0,
        downgradedToReview: publisher?.downgradedToReview || 0,
      },
      plans: discovery.plans,
      errors: [
        ...discovery.errors,
        ...(publisher?.cacheErrors || []),
        ...(publisher?.publishErrors || []),
        ...(publisher?.reservations?.errors || []),
      ].slice(0, 20),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        kind,
        error: error instanceof Error ? error.message : String(error),
      },
      { status: 500 },
    );
  }
}
