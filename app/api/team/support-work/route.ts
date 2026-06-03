import { revalidatePath } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase-admin";
import { ensureTeamProfileForCurrentUser, getActiveSession } from "@/lib/team-tools";
import { getSupportTicket, updateSupportTicketStatus } from "@/lib/support";

export const dynamic = "force-dynamic";

const ACTION_STATUS: Record<string, string | null> = { answered: null, marked_complete: "resolved", resolved: "resolved", closed: "closed", reopened: "open" };

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { user, profile } = await ensureTeamProfileForCurrentUser();
    if (!profile.can_work_support_tickets) return Response.json({ error: "Support ticket work is not enabled for your team profile." }, { status: 403 });
    const active = await getActiveSession(user.id);
    if (!active) return Response.json({ error: "Clock in before starting support ticket work. No GPS/location is required." }, { status: 400 });
    const ticketId = String(body.ticketId || "");
    const ticket = await getSupportTicket(ticketId);
    if (!ticket) return Response.json({ error: "Existing support ticket not found." }, { status: 404 });
    const action = String(body.action || "start");
    if (action === "start") {
      const { data, error } = await supabaseAdmin.from("team_work_activities").insert({ team_member_id: profile.id, user_id: user.id, work_session_id: active.id, activity_type: "support_ticket", source_type: "support_ticket", source_id: ticket.id, started_at: new Date().toISOString(), status: "active", ticket_number: ticket.ticket_number, ticket_status_before: ticket.status }).select("*").single();
      if (error) throw error;
      await supabaseAdmin.from("support_tickets").update({ assigned_team_member_id: profile.id, last_work_session_id: active.id }).eq("id", ticket.id).then(undefined, () => undefined);
      return Response.json({ activity: data });
    }
    if (action === "stop") {
      const { data: current } = await supabaseAdmin.from("team_work_activities").select("*").eq("user_id", user.id).eq("source_id", ticket.id).eq("source_type", "support_ticket").eq("status", "active").order("started_at", { ascending: false }).limit(1).maybeSingle();
      if (!current) return Response.json({ error: "No active ticket work found for this ticket." }, { status: 404 });
      const now = new Date();
      const minutes = Math.max(1, Math.ceil((now.getTime() - new Date(current.started_at).getTime()) / 60000));
      const { data, error } = await supabaseAdmin.from("team_work_activities").update({ ended_at: now.toISOString(), minutes_spent: minutes, status: "completed", updated_at: now.toISOString() }).eq("id", current.id).select("*").single();
      if (error) throw error;
      await supabaseAdmin.from("support_tickets").update({ total_tracked_minutes: minutes }).eq("id", ticket.id).then(undefined, () => undefined);
      return Response.json({ activity: data });
    }
    const statusAfter = ACTION_STATUS[action];
    if (!(action in ACTION_STATUS)) return Response.json({ error: "Unsupported ticket action." }, { status: 400 });
    let updatedTicket = ticket;
    if (statusAfter) updatedTicket = (await updateSupportTicketStatus(ticket.id, statusAfter)).ticket;
    const stampColumn = action === "answered" ? "answered_at" : action === "marked_complete" ? "marked_complete_at" : action === "resolved" ? "resolved_at" : action === "closed" ? "closed_at" : null;
    const updates: Record<string, unknown> = { last_work_session_id: active.id };
    if (stampColumn) updates[stampColumn] = new Date().toISOString();
    if (action === "marked_complete") updates.completed_by_team_member_id = profile.id;
    await supabaseAdmin.from("support_tickets").update(updates).eq("id", ticket.id).then(undefined, () => undefined);
    const { data, error } = await supabaseAdmin.from("team_work_activities").insert({ team_member_id: profile.id, user_id: user.id, work_session_id: active.id, activity_type: "support_ticket", source_type: "support_ticket", source_id: ticket.id, started_at: new Date().toISOString(), ended_at: new Date().toISOString(), minutes_spent: 1, status: "completed", ticket_number: ticket.ticket_number, ticket_status_before: ticket.status, ticket_status_after: updatedTicket.status, ticket_action: action, ticket_completed_at: action === "marked_complete" ? new Date().toISOString() : null, ticket_resolved_at: action === "resolved" ? new Date().toISOString() : null, ticket_closed_at: action === "closed" ? new Date().toISOString() : null }).select("*").single();
    if (error) throw error;
    revalidatePath(`/admin/dashboard/support/${ticket.id}`); revalidatePath("/team/support-work"); revalidatePath("/admin/dashboard/team/support-work");
    return Response.json({ activity: data, ticket: updatedTicket });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Could not log support work." }, { status: 400 });
  }
}
