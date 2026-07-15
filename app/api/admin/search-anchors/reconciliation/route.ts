import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const MAX_RECOVERY_ROWS = 250;

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const action = String(body?.action || "");

    if (action === "run_now") {
      const limit = Math.max(1, Math.min(Number(body?.limit || 100), 250));
      const secret = process.env.CRON_SECRET?.trim();
      if (!secret) return Response.json({ success: false, error: "CRON_SECRET is not configured." }, { status: 500 });

      const origin = new URL(request.url).origin;
      const response = await fetch(origin + "/api/cron/search-anchor-reconciliation?limit=" + limit, {
        method: "GET",
        headers: { authorization: "Bearer " + secret },
        cache: "no-store",
      });
      const payload = await response.json().catch(() => ({}));
      return Response.json(payload, { status: response.status });
    }

    if (action === "cleanup_history") {
      const retentionDays = Math.max(30, Math.min(Number(body?.retentionDays || 90), 365));
      const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
      const { data, error } = await supabaseAdmin
        .from("search_anchor_reconciliation_queue")
        .delete()
        .in("status", ["completed", "cancelled"])
        .lt("processed_at", cutoff)
        .select("id");
      if (error) throw new Error(error.message);
      return Response.json({ success: true, action, deleted: data?.length ?? 0, retentionDays });
    }

    const sourceStatus = action === "retry_failed" ? "failed" : action === "requeue_dead_letter" ? "dead_letter" : null;
    if (!sourceStatus) return Response.json({ success: false, error: "Unsupported reconciliation action." }, { status: 400 });

    const { data: candidates, error: candidatesError } = await supabaseAdmin
      .from("search_anchor_reconciliation_queue")
      .select("id, location_id")
      .eq("status", sourceStatus)
      .order("updated_at", { ascending: true })
      .limit(MAX_RECOVERY_ROWS);
    if (candidatesError) throw new Error(candidatesError.message);
    if (!candidates?.length) return Response.json({ success: true, action, updated: 0, deduplicated: 0 });

    const locationIds = [...new Set(candidates.map((row: any) => row.location_id).filter(Boolean))];
    const { data: activeRows, error: activeError } = await supabaseAdmin
      .from("search_anchor_reconciliation_queue")
      .select("id, location_id")
      .in("location_id", locationIds)
      .in("status", ["pending", "processing"]);
    if (activeError) throw new Error(activeError.message);

    const activeByLocation = new Map<string, string>();
    for (const row of activeRows ?? []) activeByLocation.set(String(row.location_id), String(row.id));

    const retryIds: string[] = [];
    const duplicateIds: string[] = [];
    for (const row of candidates) {
      if (activeByLocation.has(String(row.location_id))) duplicateIds.push(String(row.id));
      else retryIds.push(String(row.id));
    }

    if (duplicateIds.length) {
      const { error: cancelError } = await supabaseAdmin
        .from("search_anchor_reconciliation_queue")
        .update({
          status: "cancelled",
          locked_at: null,
          locked_by: null,
          processed_at: new Date().toISOString(),
          last_error: "Superseded by an existing pending or processing reconciliation item.",
          updated_at: new Date().toISOString(),
        })
        .in("id", duplicateIds)
        .eq("status", sourceStatus);
      if (cancelError) throw new Error(cancelError.message);
    }

    let updated = 0;
    if (retryIds.length) {
      const updateValues: Record<string, unknown> = {
        status: "pending",
        available_at: new Date().toISOString(),
        locked_at: null,
        locked_by: null,
        processed_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
      };
      if (action === "requeue_dead_letter") updateValues.attempts = 0;

      const { data: updatedRows, error: updateError } = await supabaseAdmin
        .from("search_anchor_reconciliation_queue")
        .update(updateValues)
        .in("id", retryIds)
        .eq("status", sourceStatus)
        .select("id");
      if (updateError) throw new Error(updateError.message);
      updated = updatedRows?.length ?? 0;
    }

    return Response.json({ success: true, action, updated, deduplicated: duplicateIds.length, boundedTo: MAX_RECOVERY_ROWS });
  } catch (error: any) {
    console.error("search_anchor_reconciliation_action_failed", error);
    return Response.json({ success: false, error: error?.message || "Could not update reconciliation queue." }, { status: 500 });
  }
}
