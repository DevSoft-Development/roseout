import { createClient } from "@supabase/supabase-js";
import { sendCronImportSummaryEmail } from "@/lib/admin/nightlyImportEmail";
import { importNycDohmhHealthData } from "@/lib/health/nycDohmh";

export const dynamic = "force-dynamic";

function authorized(request: Request) {
  if (process.env.NODE_ENV === "development") return true;
  const secret = process.env.CRON_SECRET;
  const auth = request.headers.get("authorization") || "";
  return Boolean(
    secret &&
    (auth === `Bearer ${secret}` ||
      request.headers.get("x-cron-secret") === secret),
  );
}
function adminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.",
    );
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
async function handler(request: Request) {
  if (!authorized(request))
    return Response.json(
      {
        success: false,
        error: "Unauthorized health intelligence import request.",
      },
      { status: 401 },
    );
  const cronName = "Nightly Health Department Intelligence";
  const startedAt = new Date().toISOString();
  const start = Date.now();
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
  const summary = await importNycDohmhHealthData({
    supabase: adminClient(),
    limit: 10000,
    batchSize: 1000,
    maxPages: 10,
    dryRun: false,
    sinceDate: since,
  });
  const finishedAt = new Date().toISOString();
  const durationMs = Date.now() - start;
  sendCronImportSummaryEmail({
    success: summary.success,
    cronName,
    startedAt,
    finishedAt,
    durationMs,
    steps: [
      {
        path: "/api/cron/health-intelligence",
        ok: summary.success,
        status: summary.success ? 200 : 500,
        label: "NYC DOHMH import",
        data: {
          processed: summary.processedCount,
          imported: summary.insertedInspectionCount,
          updated: summary.updatedLocationCount,
          skipped: summary.skippedCount,
          failed: summary.failedCount,
          error: summary.errors.join("\n") || undefined,
        },
      },
    ],
  }).catch(() => undefined);
  return Response.json({
    success: summary.success,
    cronName,
    startedAt,
    finishedAt,
    durationMs,
    summary,
  });
}
export async function GET(request: Request) {
  return handler(request);
}
export async function POST(request: Request) {
  return handler(request);
}
