import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { acceptedJobResponse, dateBucket, enqueueWorkerJob } from "@/lib/workers/enqueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deprecated compatibility endpoint: long-running reconciliation now runs through
// the Supabase Edge job-worker as search.anchor.reconcile.
export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  const batchSize = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get("limit") || 100), 250));
  const job = await enqueueWorkerJob({
    jobType: "search.anchor.reconcile",
    payload: { batchSize, source: "compatibility_route", route: "/api/cron/search-anchor-reconciliation" },
    idempotencyKey: `search.anchor.reconcile:${dateBucket(request)}`,
    priority: 40,
    createdByLabel: "cron:search-anchor-reconciliation",
  });

  return acceptedJobResponse(job);
}

export async function POST(request: NextRequest) {
  return GET(request).catch((error: unknown) =>
    NextResponse.json({ success: false, error: error instanceof Error ? error.message : "enqueue_failed" }, { status: 500 }),
  );
}
