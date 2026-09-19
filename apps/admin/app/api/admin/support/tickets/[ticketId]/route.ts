import { NextResponse } from "next/server";
import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";

const SUPPORT_TICKET_DETAIL_FIELDS = "id,ticket_number,requester_type,requester_name,requester_email,requester_phone,related_user_id,related_location_id,related_location_type,subject,description,status,priority,source,assigned_to,assigned_group,assigned_admin_id,assigned_admin_email,assigned_admin_name,assigned_team_member_id,topic,department,category,tags,total_tracked_minutes,first_response_at,answered_at,resolved_at,closed_at,reopened_at,escalated_at,sla_first_response_due_at,sla_resolution_due_at,last_message_at,last_activity_at,created_at,updated_at";
const SUPPORT_MESSAGE_FIELDS = "id,ticket_id,direction,from_address,to_address,subject,body,status,created_by,created_at";

export async function GET(_: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { error, supabase } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.experienceInboxManage);
  if (error) return error;
  const id = (await params).ticketId;
  const [{ data: ticket, error: ticketError }, { data: messages, error: messageError }] = await Promise.all([
    supabase.from("support_tickets").select(SUPPORT_TICKET_DETAIL_FIELDS).eq("id", id).single(),
    supabase.from("support_ticket_messages").select(SUPPORT_MESSAGE_FIELDS).eq("ticket_id", id).order("created_at"),
  ]);
  if (ticketError) return NextResponse.json({ success: false, error: ticketError.message }, { status: 404 });
  if (messageError) return NextResponse.json({ success: false, error: messageError.message }, { status: 500 });
  return NextResponse.json({ success: true, ticket, messages: messages || [] });
}

export async function PATCH(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const { error, supabase } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.experienceInboxManage);
  if (error) return error;
  const b = await req.json();
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  for (const k of ["status", "priority", "assigned_to", "closed_at"]) if (k in b) updates[k] = b[k];
  if (updates.status === "closed" && !updates.closed_at) updates.closed_at = new Date().toISOString();
  const { data, error: updateError } = await supabase
    .from("support_tickets")
    .update(updates)
    .eq("id", (await params).ticketId)
    .select(SUPPORT_TICKET_DETAIL_FIELDS)
    .single();
  if (updateError) return NextResponse.json({ success: false, error: updateError.message }, { status: 400 });
  return NextResponse.json({ success: true, ticket: data });
}
