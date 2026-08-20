import { Resend } from "resend";
import { sendSms } from "@/lib/sms/sendSms";

export type ExperienceBookingDeliveryResult = {
  email: { attempted: boolean; sent: boolean; error?: string };
  sms: { attempted: boolean; sent: boolean; error?: string };
};

function safeError(error: unknown) {
  return error instanceof Error ? error.message.slice(0, 300) : String(error || "Unknown delivery error").slice(0, 300);
}

function siteUrl(path: string) {
  const base = (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://www.theouthaven.com").replace(/\/$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}

function escapeHtml(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

async function sendEmail({ to, subject, html, text }: { to: string | string[]; subject: string; html: string; text: string }) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) throw new Error("RESEND_API_KEY is not configured");
  const resend = new Resend(apiKey);
  const from = process.env.EXPERIENCE_BOOKINGS_EMAIL_FROM?.trim() || process.env.RESEND_FROM_EMAIL?.trim() || "TheOutHaven <bookings@theouthaven.com>";
  const { error } = await resend.emails.send({ from, to, subject, html, text });
  if (error) throw new Error(error.message || "Email delivery failed");
}

export async function deliverExperienceBooking({
  customerName,
  email,
  phone,
  experienceTitle,
  startsAt,
  publicToken,
  checkinCode,
}: {
  customerName: string;
  email: string;
  phone: string | null;
  experienceTitle: string;
  startsAt: string;
  publicToken: string;
  checkinCode: string;
}): Promise<ExperienceBookingDeliveryResult> {
  const passUrl = siteUrl(`/experience-bookings/${publicToken}`);
  const qrUrl = siteUrl(`/api/experience-bookings/${publicToken}/qr`);
  const when = formatDate(startsAt);
  const result: ExperienceBookingDeliveryResult = {
    email: { attempted: true, sent: false },
    sms: { attempted: Boolean(phone), sent: false },
  };

  try {
    await sendEmail({
      to: email,
      subject: `Your booking for ${experienceTitle}`,
      html: `<div style="background:#090909;padding:32px 16px;font-family:Arial,sans-serif;color:#fff"><div style="max-width:560px;margin:0 auto;background:#151515;border:1px solid #2c2c2c;border-radius:24px;overflow:hidden"><div style="padding:28px;text-align:center;border-bottom:1px solid #2c2c2c"><div style="font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:#fda4af;font-weight:700">TheOutHaven Experience</div><h1 style="margin:12px 0 8px;font-size:28px;color:#fff">${escapeHtml(experienceTitle)}</h1><div style="color:#c4bdb9;font-size:14px">${escapeHtml(when)}</div></div><div style="padding:28px;text-align:center"><p style="margin:0 0 18px;color:#eee;font-size:16px">Hi ${escapeHtml(customerName)}, your booking is confirmed.</p><img src="${qrUrl}" alt="Experience booking QR code" width="320" height="320" style="display:block;width:100%;max-width:320px;height:auto;margin:0 auto;background:#fff;padding:12px;border-radius:20px"/><p style="margin:20px 0 6px;color:#fff;font-weight:700">Scan this QR code when you arrive.</p><p style="margin:0 0 6px;color:#a8a09c;font-size:13px">Backup check-in code</p><div style="font-size:30px;letter-spacing:.18em;font-weight:800;color:#fff">${escapeHtml(checkinCode)}</div><a href="${passUrl}" style="display:inline-block;margin-top:24px;background:#e11d48;color:#fff;text-decoration:none;padding:14px 22px;border-radius:12px;font-weight:700">Open booking pass</a></div></div></div>`,
      text: `Hi ${customerName}, your ${experienceTitle} booking is confirmed for ${when}. Check-in code: ${checkinCode}. Booking pass: ${passUrl}`,
    });
    result.email.sent = true;
  } catch (error) {
    result.email.error = safeError(error);
  }

  if (phone) {
    try {
      await sendSms({
        to: phone,
        body: `TheOutHaven: ${experienceTitle} is confirmed for ${when}. Check-in code: ${checkinCode}. Pass: ${passUrl}`,
      });
      result.sms.sent = true;
    } catch (error) {
      result.sms.error = safeError(error);
    }
  }

  return result;
}

export async function deliverExperienceHostNotification({
  hostName,
  emails,
  phone,
  experienceTitle,
  startsAt,
  customerName,
  partySize,
  managePath,
}: {
  hostName: string;
  emails: string[];
  phone: string | null;
  experienceTitle: string;
  startsAt: string;
  customerName: string;
  partySize: number;
  managePath: string;
}): Promise<ExperienceBookingDeliveryResult> {
  const uniqueEmails = Array.from(new Set(emails.map((value) => value.trim().toLowerCase()).filter(Boolean)));
  const manageUrl = siteUrl(managePath);
  const when = formatDate(startsAt);
  const result: ExperienceBookingDeliveryResult = {
    email: { attempted: uniqueEmails.length > 0, sent: false },
    sms: { attempted: Boolean(phone), sent: false },
  };

  if (uniqueEmails.length) {
    try {
      await sendEmail({
        to: uniqueEmails,
        subject: `New booking: ${experienceTitle}`,
        html: `<div style="font-family:Arial,sans-serif;background:#090909;color:#fff;padding:28px"><div style="max-width:560px;margin:auto;background:#151515;border:1px solid #2c2c2c;border-radius:20px;padding:26px"><p style="color:#fda4af;font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase">TheOutHaven Booking Alert</p><h1 style="font-size:24px;margin:10px 0">New Experience booking</h1><p>Hi ${escapeHtml(hostName)}, ${escapeHtml(customerName)} booked <strong>${escapeHtml(experienceTitle)}</strong>.</p><p><strong>${partySize}</strong> guest${partySize === 1 ? "" : "s"} · ${escapeHtml(when)}</p><a href="${manageUrl}" style="display:inline-block;margin-top:16px;background:#e11d48;color:#fff;text-decoration:none;padding:13px 20px;border-radius:10px;font-weight:700">Manage booking</a></div></div>`,
        text: `New TheOutHaven booking: ${customerName} booked ${experienceTitle} for ${partySize} guest${partySize === 1 ? "" : "s"} on ${when}. Manage: ${manageUrl}`,
      });
      result.email.sent = true;
    } catch (error) {
      result.email.error = safeError(error);
    }
  }

  if (phone) {
    try {
      await sendSms({
        to: phone,
        body: `TheOutHaven: New booking for ${experienceTitle}. ${customerName}, party of ${partySize}, ${when}. Manage: ${manageUrl}`,
      });
      result.sms.sent = true;
    } catch (error) {
      result.sms.error = safeError(error);
    }
  }

  return result;
}
