import "server-only";

import { sendEmailViaIntegrationApi } from "@/lib/aws/integration-api";
import { addCanonicalSupportMessage } from "@/lib/support/canonical";
import {
  normalizePhone,
  sendTelnyxSmsFromNumber,
  TELNYX_CHANNEL_NUMBERS,
} from "@/lib/sms/telnyx";
import { getAdminDatabaseClient } from "@theouthaven/db/admin-client";

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function supportEmailFrom() {
  return process.env.SUPPORT_EMAIL_FROM
    || process.env.THEOUTHAVEN_SUPPORT_EMAIL
    || "TheOutHaven Support <support@theouthaven.com>";
}

export async function replyToSupportCustomer(input: {
  ticketId: string;
  body: string;
  actorUserId?: string | null;
  authorName: string;
  authorEmail?: string | null;
}) {
  const db = getAdminDatabaseClient();
  const body = String(input.body || "").trim();
  if (!body) throw new Error("Reply message is required.");

  const { data: ticket, error } = await db
    .from("support_tickets")
    .select("id,subject,status,source,requester_email,requester_phone,metadata")
    .eq("id", input.ticketId)
    .maybeSingle();
  if (error) throw error;
  if (!ticket?.id) throw new Error("Support ticket not found.");

  if (ticket.source === "sms" && ticket.requester_phone) {
    const { data: latestInbound, error: inboundError } = await db
      .from("support_ticket_messages")
      .select("to_address,created_at")
      .eq("ticket_id", ticket.id)
      .eq("direction", "inbound")
      .eq("channel", "sms")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (inboundError) throw inboundError;

    const phone = normalizePhone(ticket.requester_phone);
    const metadata = ticket.metadata && typeof ticket.metadata === "object" && !Array.isArray(ticket.metadata)
      ? ticket.metadata as Record<string, unknown>
      : {};
    const fromNumber = normalizePhone(
      latestInbound?.to_address
        || String(metadata.reply_number || "")
        || TELNYX_CHANNEL_NUMBERS.support,
    );
    const sent = await sendTelnyxSmsFromNumber({
      to: phone,
      body,
      fromNumber,
    });
    const now = new Date().toISOString();
    const { error: insertError } = await db.from("support_ticket_messages").insert({
      ticket_id: ticket.id,
      actor_type: "admin",
      sender_role: "admin",
      sender_user_id: input.actorUserId || null,
      author_name: input.authorName,
      author_email: input.authorEmail || null,
      body,
      message: body,
      direction: "outbound",
      channel: "sms",
      provider: "telnyx",
      delivery_status: sent.status || "queued",
      from_address: fromNumber,
      to_address: phone,
      provider_message_id: sent.id,
      created_by: input.actorUserId || null,
      created_at: now,
      metadata: { human_agent_reply: true, entry_number: fromNumber },
    });
    if (insertError) throw insertError;
    const nextStatus = ticket.status === "escalated" ? "escalated" : "waiting_on_customer";
    await db.from("support_tickets").update({
      status: nextStatus,
      last_message_at: now,
      updated_at: now,
      first_response_at: now,
    }).eq("id", ticket.id);
    return { channel: "sms", providerMessageId: sent.id, status: sent.status };
  }

  if (ticket.requester_email) {
    await sendEmailViaIntegrationApi({
      from: supportEmailFrom(),
      to: ticket.requester_email,
      subject: `Re: ${ticket.subject || "TheOutHaven Support"}`,
      text: body,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><p>${escapeHtml(body).replace(/\n/g, "<br />")}</p><p>— TheOutHaven Support</p></div>`,
    });
  }

  await addCanonicalSupportMessage({
    ticketId: ticket.id,
    body,
    actorUserId: input.actorUserId || null,
    actorName: input.authorName,
    actorEmail: input.authorEmail || null,
    internalNote: false,
    senderRole: "admin",
  });
  return { channel: ticket.requester_email ? "email" : "web" };
}
