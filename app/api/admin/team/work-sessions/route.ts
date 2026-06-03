import { revalidatePath } from "next/cache";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const dynamic = "force-dynamic";

export async function PATCH(req: Request) {
  const { error: authError, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.experienceInboxManage);
  if (authError) return authError;
  try {
    const body = await req.json();
    const id = String(body.sessionId || "");
    const action = String(body.action || "");
    const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), admin_notes: body.adminNotes || null };
    if (action === "approve") Object.assign(updates, { status: "approved", approval_status: "approved", approved_by: adminUser?.user_id || null, approved_at: new Date().toISOString(), rejection_reason: null });
    else if (action === "reject") Object.assign(updates, { status: "rejected", approval_status: "rejected", rejection_reason: body.reason || "Rejected by manager" });
    else if (action === "correction") Object.assign(updates, { status: "needs_correction", approval_status: "needs_correction", rejection_reason: body.reason || "Correction requested" });
    else return Response.json({ error: "Unsupported review action." }, { status: 400 });
    const { data, error } = await supabaseAdmin.from("team_work_sessions").update(updates).eq("id", id).select("*").single();
    if (error) throw error;
    revalidatePath("/admin/dashboard/team/work-sessions");
    return Response.json({ session: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not review session." }, { status: 400 });
  }
}
