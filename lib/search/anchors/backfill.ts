import { supabaseAdmin } from "@/lib/supabase-admin";

type ActionRow = {
  id: string;
  location_id: string | null;
  anchor_id: string | null;
  action_type: "create" | "update" | "disable" | "reactivate" | "skip" | "conflict" | "manual_review";
  proposed_values: Record<string, unknown>;
  current_values: Record<string, unknown>;
  status: string;
};

export async function executeApprovedAnchorBackfill(runId: string, batchSize = 100) {
  const { data: run, error: runError } = await supabaseAdmin
    .from("search_anchor_sync_runs")
    .select("*")
    .eq("id", runId)
    .single();

  if (runError || !run) throw new Error(runError?.message || "Sync run not found");
  if (!run.dry_run || !run.approved_by) throw new Error("Only approved dry-run plans can be executed");
  if (!["completed", "approved", "paused"].includes(run.status)) throw new Error(`Run cannot execute from status ${run.status}`);

  await supabaseAdmin
    .from("search_anchor_sync_runs")
    .update({ status: "executing", started_at: run.started_at || new Date().toISOString(), paused_at: null, batch_size: batchSize })
    .eq("id", runId);

  const { data: actions, error: actionsError } = await supabaseAdmin
    .from("search_anchor_sync_actions")
    .select("*")
    .eq("sync_run_id", runId)
    .eq("status", "planned")
    .order("created_at")
    .limit(Math.max(1, Math.min(batchSize, 250)));

  if (actionsError) throw new Error(actionsError.message);

  const summary = { processed: 0, created: 0, updated: 0, disabled: 0, reactivated: 0, skipped: 0, failed: 0 };

  for (const action of (actions || []) as ActionRow[]) {
    try {
      if (["skip", "conflict", "manual_review"].includes(action.action_type)) {
        await supabaseAdmin.from("search_anchor_sync_actions").update({ status: "skipped", executed_at: new Date().toISOString() }).eq("id", action.id);
        summary.skipped++;
        continue;
      }

      if (action.action_type === "create") {
        const { data, error } = await supabaseAdmin.from("search_anchors").insert(action.proposed_values).select("id").single();
        if (error) throw error;
        await supabaseAdmin.from("search_anchor_sync_actions").update({ anchor_id: data.id, previous_values: {}, status: "completed", executed_at: new Date().toISOString() }).eq("id", action.id);
        summary.created++;
      } else {
        if (!action.anchor_id) throw new Error("Planned action is missing anchor_id");
        const patch = action.action_type === "disable"
          ? { ...action.proposed_values, is_active: false, is_searchable: false, review_status: "disabled" }
          : action.action_type === "reactivate"
            ? { ...action.proposed_values, is_active: true, is_searchable: true, review_status: "approved" }
            : action.proposed_values;
        const { error } = await supabaseAdmin.from("search_anchors").update(patch).eq("id", action.anchor_id);
        if (error) throw error;
        await supabaseAdmin.from("search_anchor_sync_actions").update({ previous_values: action.current_values, status: "completed", executed_at: new Date().toISOString() }).eq("id", action.id);
        if (action.action_type === "disable") summary.disabled++;
        else if (action.action_type === "reactivate") summary.reactivated++;
        else summary.updated++;
      }
    } catch (error: any) {
      summary.failed++;
      await supabaseAdmin.from("search_anchor_sync_actions").update({ status: "failed", error_message: error?.message || String(error), executed_at: new Date().toISOString() }).eq("id", action.id);
    } finally {
      summary.processed++;
    }
  }

  const { count: remaining } = await supabaseAdmin
    .from("search_anchor_sync_actions")
    .select("id", { count: "exact", head: true })
    .eq("sync_run_id", runId)
    .eq("status", "planned");

  const nextStatus = (remaining || 0) > 0 ? "paused" : "completed";
  await supabaseAdmin
    .from("search_anchor_sync_runs")
    .update({ status: nextStatus, paused_at: nextStatus === "paused" ? new Date().toISOString() : null, completed_at: nextStatus === "completed" ? new Date().toISOString() : null, summary: { ...(run.summary || {}), execution: summary, remaining: remaining || 0 } })
    .eq("id", runId);

  return { runId, status: nextStatus, remaining: remaining || 0, ...summary };
}
