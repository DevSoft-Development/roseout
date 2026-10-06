import { processMaterialChangeVerificationBatch } from "@/lib/location-intelligence/v2/changes";
import { collectPendingDataForSeoReviewRefreshes, submitDueDataForSeoReviewRefreshes } from "@/lib/location-intelligence/v2/review-worker";
import { refreshLocationIntelligenceProviderHealth } from "@/lib/location-intelligence/v2/provider-runtime";
import { normalizeExistingGoogleEnrichmentBatch } from "@/lib/location-intelligence/v2/google-normalization";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request) {
  const secret = String(process.env.CRON_SECRET || "").trim();
  return Boolean(secret && request.headers.get("authorization") === `Bearer ${secret}`);
}

function isPrivateAwsBackgroundRequest(request: Request) {
  return String(process.env.PLATFORM_RUNTIME_PROVIDER || "").trim() === "aws-background"
    && request.headers.get("x-toh-aws-internal") === "managed-dispatch";
}

function limitParam(request: Request, key: string, fallback: number, max: number) {
  const raw = new URL(request.url).searchParams.get(key);
  const parsed = Number(raw || fallback);
  return Number.isFinite(parsed) ? Math.max(1, Math.min(max, Math.trunc(parsed))) : fallback;
}

async function run(request: Request) {
  if (!authorized(request)) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  if (!isPrivateAwsBackgroundRequest(request)) {
    return Response.json(
      { ok: false, error: "Location Intelligence V2 maintenance runs only in the private AWS background runtime." },
      { status: 409 },
    );
  }

  try {
    const materialLimit = limitParam(request, "materialLimit", 20, 100);
    const reviewLimit = limitParam(request, "reviewLimit", 50, 100);
    const normalizationLimit = limitParam(request, "normalizationLimit", 500, 1000);
    const normalizationConcurrency = limitParam(request, "normalizationConcurrency", 10, 20);

    const [providerHealth, collectedReviews, normalization] = await Promise.all([
      refreshLocationIntelligenceProviderHealth(),
      collectPendingDataForSeoReviewRefreshes(reviewLimit),
      normalizeExistingGoogleEnrichmentBatch(normalizationLimit, normalizationConcurrency),
    ]);
    const [materialChanges, submittedReviews] = await Promise.all([
      processMaterialChangeVerificationBatch(materialLimit),
      submitDueDataForSeoReviewRefreshes(reviewLimit),
    ]);

    const collectedFailures = collectedReviews
      .filter((row) => row.status === "failed")
      .map((row) => ({
        phase: "collect",
        locationId: String(row.locationId || ""),
        taskId: String(row.taskId || ""),
        error: String(row.error || "review_task_collection_failed"),
      }));
    const submissionFailures = submittedReviews
      .filter((row) => row.submitted === false)
      .map((row) => ({
        phase: "submit",
        locationId: String(row.locationId || ""),
        error: String(row.error || "review_refresh_submit_failed"),
      }));
    const reviewFailureDetails = [...collectedFailures, ...submissionFailures];
    const reviewFailures = reviewFailureDetails.length;
    const reviewError = reviewFailures
      ? reviewFailureDetails
          .slice(0, 10)
          .map((row) => `${row.phase}:${row.locationId || "unknown"}:${row.error}`)
          .join("; ")
      : undefined;

    return Response.json({
      ok: materialChanges.failed === 0 && reviewFailures === 0,
      ...(reviewError ? { error: reviewError } : {}),
      providerHealth,
      normalization,
      materialChanges,
      reviews: {
        collected: collectedReviews,
        submitted: submittedReviews,
        failed: reviewFailures,
        failureDetails: reviewFailureDetails.slice(0, 25),
      },
    });
  } catch (error) {
    return Response.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Location Intelligence V2 maintenance failed",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
