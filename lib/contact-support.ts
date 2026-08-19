import crypto from "crypto";
import { sendNotification } from "@/lib/notifications";
import { sendSupportSms } from "@/lib/sms/telnyx";
import { renderSupportEmail, supportEmailFrom } from "@/lib/support";
import { supabaseAdmin } from "@/lib/supabase-admin";

function htmlEscape(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function siteUrl() {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "") ||
    "https://theouthaven.com"
  ).replace(/\/$/, "");
}

export async function createContactSupportTicket({
  name,
  email,
  phone,
  smsConsent,
  topic,
  message,
}: {
  name: string;
  email?: string | null;
  phone?: string | null;
  smsConsent: boolean;
  topic: string;
  message: string;
}) {
  const createdAt = new Date().toISOString();
  const ticketId = crypto.randomUUID();
  const publicAccessToken = crypto.randomBytes(24).toString("hex");
  const ticketNumber = `RO-${Date.now().toString(36).toUpperCase()}`;
  const subject = `Contact form: ${topic || "General"}`;

  const { data: ticket, error: ticketError } = await supabaseAdmin
    .from("support_tickets")
    .insert({
      id: ticketId,
      ticket_number: ticketNumber,
      requester_name: name,
      requester_email: email || null,
      requester_phone: phone || null,
      sms_consent_at: phone && smsConsent ? createdAt : null,
      sms_consent_source: phone && smsConsent ? "contact_form_checkbox" : null,
      topic: topic || "General Support",
      subject,
      status: "open",
      priority: "normal",
      source: "contact_form",
      public_access_token: publicAccessToken,
      last_message_at: createdAt,
      created_at: createdAt,
      updated_at: createdAt,
    })
    .select("*")
    .single();

  if (ticketError) throw ticketError;

  const { error: messageError } = await supabaseAdmin
    .from("support_ticket_messages")
    .insert({
      ticket_id: ticketId,
      actor_type: "creator",
      author_name: name,
      author_email: email || null,
      author_phone: phone || null,
      body: message,
      created_at: createdAt,
    });

  if (messageError) throw messageError;

  const ticketUrl = `${siteUrl()}/support/tickets/${ticketId}?key=${publicAccessToken}`;
  const adminTicketUrl = `${siteUrl()}/admin/dashboard/support/${ticketId}`;
  const adminEmail = process.env.ADMIN_NOTIFY_EMAIL;

  if (adminEmail) {
    const adminResult = await sendNotification({
      toEmail: adminEmail,
      subject: `New support ticket ${ticketNumber}: ${subject}`,
      from: supportEmailFrom(),
      emailHtml: renderSupportEmail({
        title: "New support ticket",
        greeting: "Hi team,",
        bodyHtml: `
          <p style="margin:0 0 44px;">A new contact-form support ticket is ready for review.</p>
          <p style="margin:0 0 18px;"><strong>Ticket:</strong> ${htmlEscape(ticketNumber)}</p>
          <p style="margin:0 0 18px;"><strong>Name:</strong> ${htmlEscape(name)}</p>
          <p style="margin:0 0 18px;"><strong>Email:</strong> ${htmlEscape(email || "Not provided")}</p>
          <p style="margin:0 0 18px;"><strong>Phone:</strong> ${htmlEscape(phone || "Not provided")}</p>
          <p style="margin:0 0 18px;"><strong>SMS consent:</strong> ${phone && smsConsent ? "Granted" : "Not granted"}</p>
          <p style="margin:0 0 44px;"><strong>Topic:</strong> ${htmlEscape(topic || "General Support")}</p>
          <p style="margin:0 0 18px;"><strong>Message:</strong></p>
          <p style="margin:0;">${htmlEscape(message).replace(/\n/g, "<br />")}</p>
        `,
        ctaUrl: adminTicketUrl,
        ctaLabel: "Open admin ticket",
      }),
    });

    if (adminResult.errors.length) {
      console.error("Contact admin confirmation failed", adminResult.errors);
    }
  }

  if (email) {
    const emailResult = await sendNotification({
      toEmail: email,
      subject: `We received your TheOutHaven ticket ${ticketNumber}`,
      from: supportEmailFrom(),
      emailHtml: renderSupportEmail({
        title: "We received your ticket",
        greeting: `Hi ${name || "there"},`,
        bodyHtml: `
          <p style="margin:0 0 44px;">Your support ticket is open and our team has been notified.</p>
          <p style="margin:0 0 18px;"><strong>Ticket:</strong> ${htmlEscape(ticketNumber)}</p>
          <p style="margin:0;"><strong>Subject:</strong> ${htmlEscape(subject)}</p>
        `,
        ctaUrl: ticketUrl,
        ctaLabel: "View or reply to ticket",
      }),
    });

    if (emailResult.errors.length) {
      console.error("Contact confirmation email failed", emailResult.errors);
    }
  }

  if (phone && smsConsent) {
    try {
      await sendSupportSms({
        to: phone,
        body: `TheOutHaven Support: We received ticket ${ticketNumber}. View or reply: ${ticketUrl}\n\nReply STOP to opt out. Msg & data rates may apply.`,
      });
    } catch (smsError) {
      console.error("Contact confirmation SMS failed", smsError);
    }
  }

  return {
    id: ticket?.id || ticketId,
    ticket_number: ticket?.ticket_number || ticketNumber,
    public_access_token: ticket?.public_access_token || publicAccessToken,
  };
}
