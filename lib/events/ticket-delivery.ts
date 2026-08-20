import QRCode from "qrcode";
import { Resend } from "resend";
import { sendSms } from "@/lib/sms/sendSms";

export type TicketDeliveryResult = {
  email: { attempted: boolean; sent: boolean; error?: string };
  sms: { attempted: boolean; sent: boolean; error?: string };
};

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : String(error || "Unknown delivery error").slice(0, 300);
}

function absoluteTicketUrl(ticketPath: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.theouthaven.com").replace(/\/$/, "");
  return `${base}${ticketPath.startsWith("/") ? ticketPath : `/${ticketPath}`}`;
}

function formatDate(startsAt: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone || "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(startsAt));
}

function escapeHtml(input: string) {
  return input.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

async function sendEventEmail({ to, subject, html, text }: { to: string | string[]; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const resend = new Resend(apiKey);
  const from = process.env.EVENT_TICKETS_EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim() || "TheOutHaven <tickets@theouthaven.com>";
  const { error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) throw new Error(error.message || "Email delivery failed");
}

export async function deliverEventTicket({ attendeeName, email, phone, eventTitle, startsAt, timezone, ticketPath }: { attendeeName: string; email: string; phone: string | null; eventTitle: string; startsAt: string; timezone: string; ticketPath: string }): Promise<TicketDeliveryResult> {
  const ticketUrl = absoluteTicketUrl(ticketPath);
  const qrDataUrl = await QRCode.toDataURL(ticketUrl, { width: 360, margin: 2, errorCorrectionLevel: "M" });
  const result: TicketDeliveryResult = { email: { attempted: true, sent: false }, sms: { attempted: Boolean(phone), sent: false } };
  const eventDate = formatDate(startsAt, timezone);

  try {
    await sendEventEmail({
      to: email,
      subject: `Your ticket for ${eventTitle}`,
      html: `<div style="background:#0b0908;padding:32px 16px;font-family:Arial,sans-serif;color:#fff"><div style="max-width:560px;margin:0 auto;background:#151210;border:1px solid #2b2623;border-radius:24px;overflow:hidden"><div style="padding:28px;text-align:center;border-bottom:1px solid #2b2623"><div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#fda4af;font-weight:700">TheOutHaven Admission</div><h1 style="margin:12px 0 8px;font-size:28px;color:#fff">${escapeHtml(eventTitle)}</h1><div style="color:#c4bdb9;font-size:14px">${escapeHtml(eventDate)}</div></div><div style="padding:28px;text-align:center"><p style="margin:0 0 18px;color:#eee;font-size:16px">Hi ${escapeHtml(attendeeName)}, this is your admission ticket.</p><img src="${qrDataUrl}" alt="Event ticket QR code" width="320" height="320" style="display:block;width:100%;max-width:320px;height:auto;margin:0 auto;background:#fff;padding:12px;border-radius:20px"/><p style="margin:20px 0 8px;color:#fff;font-weight:700">Present this QR code at entry.</p><a href="${ticketUrl}" style="display:inline-block;background:#e11d48;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700">Open your ticket</a></div></div></div>`,
      text: `Hi ${attendeeName}, your ticket for ${eventTitle} is ready. ${eventDate}. Open your ticket: ${ticketUrl}`,
    });
    result.email.sent = true;
  } catch (error) { result.email.error = safeError(error); }

  if (phone) {
    try {
      await sendSms({ to: phone, body: `TheOutHaven: Your ticket for ${eventTitle} is ready. Present your QR at entry: ${ticketUrl}` });
      result.sms.sent = true;
    } catch (error) { result.sms.error = safeError(error); }
  }
  return result;
}

export async function deliverEventHostNotification({ hostName, emails, phone, eventTitle, startsAt, timezone, attendeeName, quantity, managePath }: { hostName: string; emails: string[]; phone: string | null; eventTitle: string; startsAt: string; timezone: string; attendeeName: string; quantity: number; managePath: string }): Promise<TicketDeliveryResult> {
  const uniqueEmails = Array.from(new Set(emails.map((value) => value.trim().toLowerCase()).filter(Boolean)));
  const manageUrl = absoluteTicketUrl(managePath);
  const eventDate = formatDate(startsAt, timezone);
  const result: TicketDeliveryResult = { email: { attempted: uniqueEmails.length > 0, sent: false }, sms: { attempted: Boolean(phone), sent: false } };

  if (uniqueEmails.length) {
    try {
      await sendEventEmail({
        to: uniqueEmails,
        subject: `New registration: ${eventTitle}`,
        html: `<div style="font-family:Arial,sans-serif;background:#090909;color:#fff;padding:28px"><div style="max-width:560px;margin:auto;background:#151515;border:1px solid #2c2c2c;border-radius:20px;padding:26px"><p style="color:#fda4af;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">TheOutHaven Event Alert</p><h1 style="font-size:24px;margin:10px 0">New event registration</h1><p>Hi ${escapeHtml(hostName)}, ${escapeHtml(attendeeName)} registered for <strong>${escapeHtml(eventTitle)}</strong>.</p><p><strong>${quantity}</strong> ticket${quantity === 1 ? "" : "s"} · ${escapeHtml(eventDate)}</p><a href="${manageUrl}" style="display:inline-block;margin-top:16px;background:#e11d48;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Manage event</a></div></div>`,
        text: `New TheOutHaven registration: ${attendeeName} registered for ${eventTitle}, ${quantity} ticket${quantity === 1 ? "" : "s"}, ${eventDate}. Manage: ${manageUrl}`,
      });
      result.email.sent = true;
    } catch (error) { result.email.error = safeError(error); }
  }

  if (phone) {
    try {
      await sendSms({ to: phone, body: `TheOutHaven: New registration for ${eventTitle}. ${attendeeName}, ${quantity} ticket${quantity === 1 ? "" : "s"}, ${eventDate}. Manage: ${manageUrl}` });
      result.sms.sent = true;
    } catch (error) { result.sms.error = safeError(error); }
  }
  return result;
}
