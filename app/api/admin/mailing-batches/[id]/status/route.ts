import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

const WRITE_ROLES = ["superadmin", "admin", "manager"] as const;
const ACTIONS = ["queued", "printed", "mailed", "completed", "cancelled"] as const;
type BatchAction = (typeof ACTIONS)[number];

export async function POST(req: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdminApiRole(WRITE_ROLES);
  if (auth.error) return auth.error;

  try {
    const { id } = await context.params;
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "") as BatchAction;

    if (!ACTIONS.includes(action)) {
      return Response.json({ success: false, error: "Unsupported mailing batch action." }, { status: 400 });
    }

    const now = new Date().toISOString();
    const batchUpdate: Record<string, unknown> = { status: action };
    if (action === "mailed") batchUpdate.mailed_at = now;
    if (action === "completed") batchUpdate.completed_at = now;

    const { data: batch, error: batchError } = await supabaseAdmin
      .from("mailing_batches")
      .update(batchUpdate)
      .eq("id", id)
      .select("id,status")
      .maybeSingle();

    if (batchError) throw batchError;
    if (!batch) return Response.json({ success: false, error: "Mailing batch not found." }, { status: 404 });

    if (action === "printed") {
      const { error } = await supabaseAdmin
        .from("mailing_batch_items")
        .update({ status: "printed", printed_at: now })
        .eq("batch_id", id)
        .in("status", ["queued", "printed"]);
      if (error) throw error;
    } else if (action === "mailed") {
      const { error } = await supabaseAdmin
        .from("mailing_batch_items")
        .update({ status: "mailed", mailed_at: now })
        .eq("batch_id", id)
        .in("status", ["queued", "printed", "mailed"]);
      if (error) throw error;
    } else if (action === "cancelled") {
      const { error } = await supabaseAdmin
        .from("mailing_batch_items")
        .update({ status: "cancelled" })
        .eq("batch_id", id)
        .in("status", ["queued", "printed"]);
      if (error) throw error;
    } else if (action === "queued") {
      const { error } = await supabaseAdmin
        .from("mailing_batch_items")
        .update({ status: "queued" })
        .eq("batch_id", id)
        .in("status", ["queued", "printed"]);
      if (error) throw error;
    }

    return Response.json({ success: true, status: action });
  } catch (error) {
    console.error("Mailing batch status update failed", error);
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Could not update mailing batch." },
      { status: 500 },
    );
  }
}
