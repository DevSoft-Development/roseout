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
      const batchSize = Math.max(
        1,
        Math.min(Number(request.nextUrl.searchParams.get("limit") || 100), 250),
      );

      const { error: releaseError } = await supabaseAdmin.rpc(
        "release_stale_search_anchor_reconciliation_locks",
        { p_stale_minutes: 15 },
      );
      if (releaseError) throw new Error(releaseError.message);

      const { data: queuedCount, error: queueError } = await supabaseAdmin.rpc(
        "queue_stale_search_anchor_locations",
        { p_limit: 1000 },
      );
      if (queueError) throw new Error(queueError.message);

      const { data: claimedRows, error: claimError } = await supabaseAdmin.rpc(
        "claim_search_anchor_reconciliation_batch",
        {
          p_limit: batchSize,
          p_worker: "vercel-cron",
        },
      );
      if (claimError) throw new Error(claimError.message);

      const claimed = Array.isArray(claimedRows) ? claimedRows : [];
      let completed = 0;
      let failed = 0;
      const errors: Array<{ queueId: string; locationId: string; message: string }> = [];

      for (const item of claimed) {
        const queueId = String(item.id);
        const locationId = String(item.location_id);

        try {
          if (item.event_type === "delete") {
            const { error: disableError } = await supabaseAdmin
              .from("search_anchors")
              .update({
                is_active: false,
                is_searchable: false,
                review_status: "disabled",
                sync_status: "disabled_source",
                last_synced_at: new Date().toISOString(),
              })
              .eq("linked_location_id", locationId);
            if (disableError) throw new Error(disableError.message);
          } else {
            const result = await syncApprovedLocationsToSearchAnchors(supabaseAdmin, {
              mode: "location_ids",
              locationIds: [locationId],
            });
            if (result.errors.length) {
              throw new Error(result.errors.map((entry) => entry.message).join("; "));
            }
          }

          const { error: completeError } = await supabaseAdmin.rpc(
            "complete_search_anchor_reconciliation",
            {
              p_queue_id: queueId,
              p_payload: {
                completedBy: "vercel-cron",
                completedAt: new Date().toISOString(),
              },
            },
          );
          if (completeError) throw new Error(completeError.message);
          completed += 1;
        } catch (error: any) {
          failed += 1;
          const message = error?.message || String(error);
          errors.push({ queueId, locationId, message });
          await supabaseAdmin.rpc("fail_search_anchor_reconciliation", {
            p_queue_id: queueId,
            p_error: message,
            p_retry_minutes: 15,
          });
        }
      }

      const { data: orphanedDisabled, error: orphanError } = await supabaseAdmin.rpc(
        "disable_orphaned_search_anchors",
      );
      if (orphanError) throw new Error(orphanError.message);

      const responseBody = {
        success: failed === 0,
        action: "search_anchor_reconciliation",
        queued: Number(queuedCount || 0),
        claimed: claimed.length,
        completed,
        failed,
        orphanedDisabled: Number(orphanedDisabled || 0),
        errors,
      };

      return {
        message:
          failed === 0
            ? "Search anchor reconciliation completed."
            : "Search anchor reconciliation completed with errors.",
        details: responseBody,
        response: NextResponse.json(responseBody, { status: failed === 0 ? 200 : 207 }),
      };
    },
  });
}
