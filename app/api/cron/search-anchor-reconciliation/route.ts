import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { syncApprovedLocationsToSearchAnchors } from "@/lib/search/anchors/sync";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  return runTrackedCron({
    jobKey: "search-anchor-reconciliation",
    jobName: "Search Anchor Reconciliation",
    routePath: "/api/cron/search-anchor-reconciliation",
    description: "Queues stale linked-location anchors and reconciles a bounded batch.",
    scheduleHint: "Runs nightly via Vercel Cron.",
    handler: async () => {
      const batchSize = Math.max(1, Math.min(Number(request.nextUrl.searchParams.get("limit") || 100), 250));

      await supabaseAdmin.rpc("release_stale_search_anchor_reconciliation_locks", {
        p_stale_minutes: 15,
      });

      const { data: queuedCount, error: queueError } = await supabaseAdmin.rpc(
        "queue_stale_search_anchor