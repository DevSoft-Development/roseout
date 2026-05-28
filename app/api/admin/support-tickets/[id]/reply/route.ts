import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { sendSupportEmail } from "@/lib/email/sendSupportEmail";
import { buildReplySubject, SUPPORT_EMAIL_FROM } from "@/lib/support/ticketing";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, supabase, adminUser } = await requireAdminApiRole(["superadmin", "admin", "editor"]);
  if (error) return error;
  const body = await request.json();

  const { data: ticket } = await supabase.from("support_tickets").select("*").eq("id", id).single();
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });

  const subject = buildReplySubject(ticket.subject, ticket.ticket_number);
  const emailResult = await sendSupportEmail({ to: ticket.requester_email, subject, body: body.body });

  await supabase.from("support_ticket_messages").insert({
    ticket_id: ticket.id,
    direction: "outbound",
    from_address: SUPPORT_EMAIL_FROM,
    to_address: ticket.requester_email,
    subject,
    body: body.body,
    provider_message_id: emailResult.id,
    provider_thread_id: ticket.provider_thread_id,
    created_by: adminUser?.id || null,
  });

  await supabase.from("support_tickets").update({ status: body.status || "pending", last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ticket.id);

  await supabase.from("communication_logs").insert({ channel: "email", direction: "outbound", from_address: SUPPORT_EMAIL_FROM, to_address: ticket.requester_email, subject, body: body.body, status: "sent", provider_message_id: emailResult.id, recipient_type: "support_ticket", recipient_id: ticket.id, created_by: adminUser?.id || null });

  return Response.json({ ok: true });
}
