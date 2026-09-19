import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

const TICKET_SELECT = "id,ticket_number,subject,category,status,priority,source,related_outing_id,related_reservation_id,related_saved_plan_id,created_at,updated_at,last_message_at";
const MESSAGE_SELECT = "id,ticket_id,direction,sender_role,body,message,created_at";

export async function GET(_: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { ticketId } = await params;
  const { data: ticket } = await supabaseAdmin.from("support_tickets")
    .select(TICKET_SELECT)
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  const { data: messages } = await supabaseAdmin.from("support_ticket_messages")
    .select(MESSAGE_SELECT)
    .eq("ticket_id", ticketId)
    .eq("internal_note", false)
    .order("created_at");

  return NextResponse.json({ success: true, ticket, messages: messages || [] });
}
