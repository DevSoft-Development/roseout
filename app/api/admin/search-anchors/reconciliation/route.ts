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
    const sourceStatus =
      action === "retry_failed"
        ? "failed"
        : action === "requeue_dead_letter"
          ? "dead_letter"
          : null;

    if (!sourceStatus) {
      return Response.json({ success: false, error: "Unsupported reconciliation action." }, { status: 400 });
    }

    const { data: candidates, error: candidatesError } = await supabaseAdmin
      .from("search_anchor_reconciliation_queue")
      .select("id")
      .eq("status", sourceStatus)
      .order("updated_at", { ascending: true })
      .limit(MAX_RECOVERY_ROWS);

    if (candidatesError) throw new Error(candidatesError.message);

    const ids = (candidates ?? []).map((row: any) => row.id).filter(Boolean);
    if (!ids.length) {
      return Response.json({ success: true, action, updated: 0 });
    }

    const updateValues: Record<string, unknown> = {
      status: "pending",
      available_at: new Date().toISOString(),
      locked_at: null,
      locked_by: null,
      last_error: null,
      updated_at: new Date().toISOString(),
    };

    if (action === "requeue_dead_letter") updateValues.attempts = 0;

    const { data: updatedRows, error: updateError } = await supabaseAdmin
      .from("search_anchor_reconciliation_queue")
      .update(updateValues)
      .in("id", ids)
      .eq("status", sourceStatus)
      .select("id");

    if (updateError) throw new Error(updateError.message);

    return Response.json({
      success: true,
      action,
      updated: updatedRows?.length ?? 0,
      boundedTo: MAX_RECOVERY_ROWS,
    });
  } catch (error: any) {
    console.error("search_anchor_reconciliation_recovery_failed", error);
    return Response.json(
      { success: false, error: error?.message || "Could not update reconciliation queue." },
      { status: 500 },
    );
  }
}
