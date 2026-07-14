import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function POST(_request: Request, context: { params: Promise<{ runId: string }> }) {
  const auth = await requireAdminApiRole(["superadmin", "admin"]);
  if (auth.error) return auth.error;

  try {
    const { runId } = await context.params;
    const { data: run, error } = await supabaseAdmin
      .from("search_anchor_sync_runs")
      .select("id, dry_run, status")
      .eq("id", runId)
      .single();

    if (error || !run) return Response.json({ success: false, error: "Sync preview not found." }, { status: 404 });
    if (!run.dry_run) return Response.json({ success: false, error: "Only dry-run previews can be approved." }, { status: 400 });
    if (!['completed', 'approved'].includes(run.status)) return Response.json({ success: false, error: `Preview cannot be approved from status ${run.status}.` }, { status: 409 });

    const { error: updateError } = await supabaseAdmin
      .from("search_anchor_sync_runs")
      .update({ status: "approved", approved_by: auth.adminUser?.user_id ?? null })
      .eq("id", runId);

    if (updateError) throw updateError;
    return Response.json({ success: true, runId, status: "approved" });
  } catch (error: any) {
    console.error("search_anchor_sync_preview_approve_failed", error);
    return Response.json({ success: false, error: error?.message || "Could not approve sync preview." }, { status: 500 });
  }
}
