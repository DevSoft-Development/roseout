import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureTeamProfileForCurrentUser } from "@/lib/team-tools";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user, profile } = await ensureTeamProfileForCurrentUser();
    if (!profile.can_use_demo_mode) return Response.json({ error: "Demo mode is not enabled for your team profile." }, { status: 403 });
    if (body.action === "reset") {
      await supabaseAdmin.rpc("reset_demo_session", { p_demo_session_id: body.sessionId });
      revalidatePath("/admin/dashboard/crm/operations?view=demo");
      return Response.json({ success: true });
    }
    const { data, error } = await supabaseAdmin.rpc("create_demo_session_from_template", { p_master_demo_location_id: body.masterDemoLocationId, p_session_type: body.sessionType || "personal" });
    if (error) {
      const { data: fallback, error: fallbackError } = await supabaseAdmin.from("crm_demo_sessions").insert({ team_member_id: profile.id, user_id: user.id, created_by: user.id, master_demo_location_id: body.masterDemoLocationId, session_type: body.sessionType || "personal", expires_at: new Date(Date.now() + 12 * 3600000).toISOString(), session_name: "Demo Session" }).select("*").single();
      if (fallbackError) throw error;
      return Response.json({ session: fallback });
    }
    revalidatePath("/admin/dashboard/crm/operations?view=demo");
    return Response.json({ result: data?.[0] || data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update demo session." }, { status: 400 });
  }
}
