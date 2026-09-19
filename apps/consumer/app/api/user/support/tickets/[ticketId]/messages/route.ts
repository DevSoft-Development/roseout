import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase-server";
import { supabaseAdmin } from "@/lib/supabase-admin";

export async function POST(req: Request, { params }: { params: Promise<{ ticketId: string }> }) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

  const { ticketId } = await params;
  const body = await req.json().catch(() => ({}));
  const message = typeof body.message === "string" ? body.message.trim().slice(0, 4000) : "";
  if (!message) return NextResponse.json({ success: false, error: "Message is required." }, { status: 400 });

  const { data: ticket } = await supabaseAdmin.from("support_tickets")
    .select("id")
    .eq("id", ticketId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!ticket) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });

  await supabaseAdmin.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    direction: "inbound",
    sender_user_id: user.id,
    sender_role: "user",
    body: message,
  });

  const now = new Date().toISOString();
  await supabaseAdmin.from("support_tickets")
    .update({ status: "open", updated_at: now, last_message_at: now })
    .eq("id", ticketId)
    .eq("user_id", user.id);

  return NextResponse.json({ success: true });
}
