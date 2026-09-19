import { NextRequest, NextResponse } from "next/server";
import { requireCronRequest } from "@/lib/cron-auth";
import { runTrackedCron } from "@/lib/cron/runTrackedCron";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const authError = requireCronRequest(request);
  if (authError) return authError;

  return runTrackedCron({
    jobKey: "search-anchor-history-cleanup",
    jobName: "Search Anchor History Cleanup",
    routePath: "/api/cron/search-anchor-history-cleanup",
    description: "Removes completed and cancelled reconciliation events after the retention window.",
    scheduleHint: "Runs weekly via Vercel Cron.",
    handler: async () => {
      const retentionDays = Math.max(30, Math.min(Number(request.nextUrl.searchParams.get("days") || 90), 365));
      const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();

      const { data, error } = await supabaseAdmin
        .from("search_anchor_reconciliation_queue")
        .delete()
        .in("status", ["completed", "cancelled"])
        .lt("processed_at", cutoff)
        .select("id");
      if (error) throw new Error(error.message);

      const details = { success: true, deleted: data?.length ?? 0, retentionDays, cutoff };
      return {
        message: "Old search anchor activity history was cleaned up.",
        details,
        response: NextResponse.json(details),
      };
    },
  });
}
