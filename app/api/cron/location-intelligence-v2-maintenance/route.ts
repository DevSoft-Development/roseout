import { processMaterialChangeVerificationBatch } from "@/lib/location-intelligence/v2/changes";
import { submitDueDataForSeoReviewRefreshes } from "@/lib/location-intelligence/v2/review-worker";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

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
    const reviewLimit = limitParam(request, "reviewLimit", 20, 100);

    const [materialChanges, reviews] = await Promise.all([
      processMaterialChangeVerificationBatch(materialLimit),
      submitDueDataForSeoReviewRefreshes(reviewLimit),
    ]);

    return Response.json({
      ok: materialChanges.failed === 0 && reviews.every((row) => row.submitted !== false),
      materialChanges,
      reviews: {
        processed: reviews.length,
        failed: reviews.filter((row) => row.submitted === false).length,
        results: reviews,
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
