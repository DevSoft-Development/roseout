import { requireAdminApiRole } from "@/lib/admin-api-auth";
import { ADMIN_PAGE_ACCESS } from "@/lib/admin-permissions";
import { sendSupportEmail } from "@/lib/email/sendSupportEmail";
import { buildReplySubject, SUPPORT_EMAIL_FROM } from "@/lib/support/ticketing";

const SUPPORT_REPLY_FIELDS = "id,ticket_number,requester_email,subject,provider_thread_id";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { error, supabase, adminUser } = await requireAdminApiRole(ADMIN_PAGE_ACCESS.experienceInboxManage);
  if (error) return error;
  const body = await request.json();
  const replyBody = String(body?.body || "").trim();
  if (!replyBody) return Response.json({ error: "Reply body is required" }, { status: 400 });

  const { data: ticket } = await supabase.from("support_tickets").select(SUPPORT_REPLY_FIELDS).eq("id", id).single();
  if (!ticket) return Response.json({ error: "Ticket not found" }, { status: 404 });

  const subject = buildReplySubject(ticket.subject, ticket.ticket_number);
  const emailResult = await sendSupportEmail({ to: ticket.requester_email, subject, body: replyBody });

  await supabase.from("support_ticket_messages").insert({
    ticket_id: ticket.id,
    direction: "outbound",
    from_address: SUPPORT_EMAIL_FROM,
    to_address: ticket.requester_email,
    subject,
    body: replyBody,
    provider_message_id: emailResult.id,
    provider_thread_id: ticket.provider_thread_id,
    created_by: adminUser?.user_id || null,
  });

  await supabase.from("support_tickets").update({ status: body.status || "pending", last_message_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", ticket.id);

  await supabase.from("communication_logs").insert({ channel: "email", direction: "outbound", from_address: SUPPORT_EMAIL_FROM, to_address: ticket.requester_email, subject, body: replyBody, status: "sent", provider_message_id: emailResult.id, recipient_type: "support_ticket", recipient_id: ticket.id, created_by: adminUser?.user_id || null });

  return Response.json({ ok: true });
}
