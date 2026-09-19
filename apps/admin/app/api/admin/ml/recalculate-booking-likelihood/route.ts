import { NextRequest, NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { isCronRequestAuthorized } from "@/lib/cron-auth";
import { acceptedJobResponse, enqueueWorkerJob } from "@/lib/workers/enqueue";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function authorize(request: NextRequest) {
  if (isCronRequestAuthorized(request)) return null;
  const auth = await requireAdminApiRole(ADMIN_PAGE_ACCESS.import);
  return auth.error;
}

// Deprecated compatibility endpoint: recalculation is durable and asynchronous via
// ml.booking_likelihood.recalculate on the shared Supabase Edge job-worker.
export async function POST(request: NextRequest) {
  const authError = await authorize(request);
  if (authError) return authError;

  const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
  const locationId = typeof body.locationId === "string" ? body.locationId : undefined;
  const market = typeof body.market === "string" ? body.market : undefined;
  const scope = locationId ? `location:${locationId}` : market ? `market:${market}` : "all";
  const modelVersion = typeof body.modelVersion === "string" ? body.modelVersion : "current";
  const job = await enqueueWorkerJob({
    jobType: "ml.booking_likelihood.recalculate",
    payload: { ...body, modelVersion, source: "compatibility_route", route: "/api/admin/ml/recalculate-booking-likelihood" },
    idempotencyKey: `ml.booking_likelihood.recalculate:${modelVersion}:${scope}:${Boolean(body.dryRun)}:${Boolean(body.force)}`,
    priority: 60,
    createdByLabel: "admin:ml-booking-likelihood",
  });

  return acceptedJobResponse(job);
}

export async function GET() {
  return NextResponse.json({ success: false, error: "Use POST to enqueue booking-likelihood recalculation." }, { status: 405 });
}
