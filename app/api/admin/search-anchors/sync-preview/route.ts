import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { buildSearchAnchorSyncPreview } from "@/lib/search/anchors/syncPreview";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const auth = await requireAdminApiRole(["superadmin", "admin", "manager"]);
  if (auth.error) return auth.error;

  try {
    const body = await request.json().catch(() => ({}));
    const mode = String(body?.mode || "all");
    const market = String(body?.market || "").trim();

    if (mode === "market" && !market) {
      return Response.json({ success: false, error: "Market is required." }, { status: 400 });
    }

    const scope: any = mode === "market"
      ? { mode: "market", market }
      : mode === "location_ids"
        ? { mode: "location_ids", locationIds: Array.isArray(body?.locationIds) ? body.locationIds : [] }
        : mode === "missing_only"
          ? { mode: "missing_only" }
          : mode === "existing_only"
            ? { mode: "existing_only" }
            : { mode: "all" };

    const preview = await buildSearchAnchorSyncPreview(supabaseAdmin, scope);
    const { data: run, error: runError } = await supabaseAdmin
      .from("search_anchor_sync_runs")
      .insert({
        mode: scope.mode,
        market: scope.market ?? null,
        dry_run: true,
        status: "completed",
        summary: preview.summary,
        requested_by: auth.adminUser?.user_id ?? null,
        completed_at: new Date().toISOString(),
      })
      .select("id, status")
      .single();

    if (runError || !run) throw runError || new Error("Could not save sync preview.");

    if (preview.actions.length) {
      const actionRows = preview.actions.map((action: any) => ({
        sync_run_id: run.id,
        location_id: action.locationId,
        anchor_id: action.anchorId,
        action_type: action.action,
        reason_code: action.reason,
        current_values: Object.fromEntries(Object.entries(action.changes || {}).map(([key, value]: any) => [key, value?.from ?? null])),
        proposed_values: Object.fromEntries(Object.entries(action.changes || {}).map(([key, value]: any) => [key, value?.to ?? null])),
        warnings: action.warnings || [],
        status: "planned",
      }));
      const { error: actionsError } = await supabaseAdmin.from("search_anchor_sync_actions").insert(actionRows);
      if (actionsError) throw actionsError;
    }

    return Response.json({
      success: true,
      runId: run.id,
      status: run.status,
      summary: preview.summary,
      actions: preview.actions,
    });
  } catch (error: any) {
    console.error("search_anchor_sync_preview_failed", error);
    return Response.json({ success: false, error: error?.message || "Could not run sync preview." }, { status: 500 });
  }
}
