import { createClient } from "@/lib/supabase-server";
import { sendSupportEmail } from "@/lib/email/sendSupportEmail";
import { buildSupportAutoReplyBody, extractTicketNumber, normalizeSubject, SUPPORT_EMAIL_FROM } from "@/lib/support/ticketing";

function generateTicketNumber() {
  return `TOH-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function POST(request: Request) {
  const secret = request.headers.get("x-support-webhook-secret");
  if (!process.env.SUPPORT_EMAIL_WEBHOOK_SECRET || secret !== process.env.SUPPORT_EMAIL_WEBHOOK_SECRET) {
    return Response.json({ error: "Invalid webhook secret" }, { status: 401 });
  }

  const body = await request.json();
  const supabase = await createClient();

  const fromEmail = (body.from || body.from_address || "").toLowerCase();
  const requesterName = body.from_name || body.name || null;
  const subject = body.subject || "Support request";
  const messageBody = body.text || body.body || "";
  const providerThreadId = body.thread_id || null;
  const providerMessageId = body.message_id || null;
  const normalized = normalizeSubject(subject);
  const parsedTicketNumber = extractTicketNumber(subject);

  let ticketQuery = supabase.from("support_tickets").select("*").in("status", ["open", "pending", "waiting_on_customer"] as never[]).limit(1);
  if (providerThreadId) ticketQuery = ticketQuery.eq("provider_thread_id", providerThreadId);
  else if (parsedTicketNumber) ticketQuery = ticketQuery.eq("ticket_number", parsedTicketNumber);
  else ticketQuery = ticketQuery.eq("requester_email", fromEmail).ilike("subject", `%${normalized}%`);

  let { data: ticket } = await ticketQuery.maybeSingle();

  if (!ticket) {
    const { data: created } = await supabase.from("support_tickets").insert({
      ticket_number: generateTicketNumber(), requester_email: fromEmail, requester_name: requesterName,
      subject, status: "open", priority: "normal", source: "email", provider_thread_id: providerThreadId,
      provider_message_id: providerMessageId, last_message_at: new Date().toISOString(),
    }).select("*").single();
    ticket = created;
  }

  if (!ticket) return Response.json({ error: "Could not create or load ticket" }, { status: 500 });

  await supabase.from("support_ticket_messages").insert({ ticket_id: ticket.id, direction: "inbound", from_address: fromEmail, to_address: SUPPORT_EMAIL_FROM, subject, body: messageBody, provider_message_id: providerMessageId, provider_thread_id: providerThreadId });
  await supabase.from("support_tickets").update({ provider_thread_id: providerThreadId || ticket.provider_thread_id, provider_message_id: providerMessageId, last_message_at: new Date().toISOString(), updated_at: new Date().toISOString(), status: "open" }).eq("id", ticket.id);
  await supabase.from("communication_logs").insert({ channel: "email", direction: "inbound", from_address: fromEmail, to_address: SUPPORT_EMAIL_FROM, subject, body: messageBody, status: "received", provider_message_id: providerMessageId, recipient_type: "support_ticket", recipient_id: ticket.id });

  const confirmationSubject = `We received your message — TheOutHaven Support #${ticket.ticket_number}`;
  const confirmationBody = buildSupportAutoReplyBody(requesterName, ticket.ticket_number, ticket.subject);
  await sendSupportEmail({ to: fromEmail, subject: confirmationSubject, body: confirmationBody });

  return Response.json({ ok: true, ticketNumber: ticket.ticket_number });
}
