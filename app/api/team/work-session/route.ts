import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureTeamProfileForCurrentUser, getActiveSession, getAllowedWorkTypesForUser, isWorkTypeAllowed } from "@/lib/team-tools";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const { user, profile } = await ensureTeamProfileForCurrentUser();
    const [activeSession, allowedWorkTypes, recent] = await Promise.all([
      getActiveSession(user.id),
      getAllowedWorkTypesForUser(user.id, profile),
      supabaseAdmin.from("team_work_sessions").select("*").eq("user_id", user.id).order("clock_in_at", { ascending: false }).limit(10),
    ]);
    return Response.json({ profile, allowedWorkTypes, activeSession, recentSessions: recent.data || [] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not load Team Tools." }, { status: 401 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user, profile } = await ensureTeamProfileForCurrentUser();
    const action = String(body.action || "start");
    if (action === "start") {
      const workType = String(body.workType || "").trim();
      if (!(await isWorkTypeAllowed(user.id, workType, profile))) {
        return Response.json({ error: "This work type is not allowed for your team profile." }, { status: 400 });
      }
      const active = await getActiveSession(user.id);
      if (active) return Response.json({ error: "You already have an active work session." }, { status: 400 });
      const { data, error } = await supabaseAdmin.from("team_work_sessions").insert({
        team_member_id: profile.id,
        user_id: user.id,
        team_type: profile.team_type,
        work_type: workType,
        user_notes: body.userNotes || null,
        device_id: body.deviceId || null,
        device_name: body.deviceName || null,
        is_training: Boolean(body.isTraining),
        is_demo: Boolean(body.isDemo),
        demo_session_id: body.demoSessionId || null,
        is_remote: ["experience_team", "support_team"].includes(profile.team_type) || ["social_outreach", "phone_outreach", "email_outreach", "support_ticket", "admin_work"].includes(workType),
      }).select("*").single();
      if (error) throw error;
      revalidatePath("/team");
      revalidatePath("/admin/dashboard/team/work-sessions");
      return Response.json({ session: data });
    }
    const sessionId = String(body.sessionId || "");
    const active = await getActiveSession(user.id);
    if (!active || active.id !== sessionId) return Response.json({ error: "Active work session not found." }, { status: 404 });
    const now = new Date();
    const totalMinutes = Math.max(1, Math.ceil((now.getTime() - new Date(active.clock_in_at).getTime()) / 60000) - Number(active.break_minutes || 0));
    const { data, error } = await supabaseAdmin.from("team_work_sessions").update({
      clock_out_at: now.toISOString(),
      total_minutes: totalMinutes,
      status: "completed",
      approval_status: "pending_review",
      user_notes: body.userNotes || active.user_notes,
      updated_at: now.toISOString(),
    }).eq("id", sessionId).eq("user_id", user.id).select("*").single();
    if (error) throw error;
    revalidatePath("/team");
    revalidatePath("/admin/dashboard/team/work-sessions");
    return Response.json({ session: data });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not update work session." }, { status: 400 });
  }
}
