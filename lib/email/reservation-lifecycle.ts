import { THEOUTHAVEN_BRAND } from "./brand";
import type { RenderedEmail } from "./types";

export type ReservationLifecycleKind = "confirmation" | "reminder" | "modified" | "cancelled" | "waitlist";

export type ReservationLifecycleEmailInput = {
  kind: ReservationLifecycleKind;
  locationName: string;
  reservationDate: string;
  reservationTime: string;
  partySize?: number | null;
  confirmationCode?: string | null;
  customerName?: string | null;
  ctaUrl?: string | null;
};

const site = "https://theouthaven.com";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatDate(value: string) {
  const match = String(value || "").match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function formatTime(value: string) {
  const [hourRaw, minuteRaw = "00"] = String(value || "00:00").slice(0, 5).split(":");
  const hour = Number(hourRaw);
  if (!Number.isFinite(hour)) return value;
  return `${hour % 12 || 12}:${minuteRaw} ${hour >= 12 ? "PM" : "AM"}`;
}

const COPY: Record<ReservationLifecycleKind, {
  subject: (location: string) => string;
  badge: string;
  heading: string;
  intro: string;
  cta: string;
  footer: string;
}> = {
  confirmation: {
    subject: (location) => `Your ${location} reservation is confirmed`,
    badge: "CONFIRMED",
    heading: "Reservation confirmed",
    intro: "Your booking is set. Everything you need is below.",
    cta: "Manage reservation",
    footer: "View, reschedule, or cancel this booking in TheOutHaven.",
  },
  reminder: {
    subject: (location) => `Reminder: your ${location} reservation is coming up`,
    badge: "UPCOMING",
    heading: "Reservation reminder",
    intro: "Your reservation is coming up soon. Here are the latest details.",
    cta: "Manage reservation",
    footer: "Need to make a change? Manage your reservation before you arrive.",
  },
  modified: {
    subject: (location) => `Your ${location} reservation was updated`,
    badge: "UPDATED",
    heading: "Reservation updated",
    intro: "Your reservation details have been updated. Please review the latest booking below.",
    cta: "View updated reservation",
    footer: "These are the current reservation details on file.",
  },
  cancelled: {
    subject: (location) => `Your ${location} reservation was cancelled`,
    badge: "CANCELLED",
    heading: "Reservation cancelled",
    intro: "Your reservation has been cancelled. The cancelled booking details are below for your records.",
    cta: "Explore TheOutHaven",
    footer: "Ready to make new plans? Discover another place or outing on TheOutHaven.",
  },
  waitlist: {
    subject: (location) => `A reservation spot opened at ${location}`,
    badge: "AVAILABLE",
    heading: "A spot just opened",
    intro: "A matching reservation spot is available. Availability can change quickly.",
    cta: "View availability",
    footer: "Open TheOutHaven to review the available reservation option.",
  },
};

export function renderReservationLifecycleEmail(input: ReservationLifecycleEmailInput): RenderedEmail {
  const c = THEOUTHAVEN_BRAND.colors;
  const copy = COPY[input.kind];
  const locationName = input.locationName || "TheOutHaven location";
  const displayDate = formatDate(input.reservationDate);
  const displayTime = formatTime(input.reservationTime);
  const partySize = Math.max(Number(input.partySize || 1), 1);
  const ctaUrl = input.ctaUrl || (input.kind === "cancelled" ? site : `${site}/reservations`);
  const preview = `${locationName} · ${displayDate} · ${displayTime}`;
  const badgeBackground = input.kind === "cancelled" ? c.softRed : input.kind === "reminder" || input.kind === "waitlist" ? "#3a2b10" : "#17351f";
  const badgeText = input.kind === "cancelled" ? c.accent : input.kind === "reminder" || input.kind === "waitlist" ? "#f5c76b" : "#70df8b";

  const detailRow = (label: string, value: string, last = false) => `
    <tr>
      <td style="padding:14px 0;${last ? "" : `border-bottom:1px solid ${c.border};`}color:${c.subtle};font-size:13px;line-height:20px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;">${escapeHtml(label)}</td>
      <td align="right" style="padding:14px 0;${last ? "" : `border-bottom:1px solid ${c.border};`}color:${c.text};font-size:15px;line-height:20px;font-weight:700;">${escapeHtml(value)}</td>
    </tr>`;

  const html = `<!doctype html>
<html>
<head>
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="color-scheme" content="dark" />
  <meta name="supported-color-schemes" content="dark" />
  <style>
    @media only screen and (max-width:620px) {
      .email-shell { width:100% !important; }
      .email-pad { padding-left:22px !important; padding-right:22px !important; }
      .location-title { font-size:28px !important; line-height:34px !important; }
      .hero-title { font-size:20px !important; line-height:26px !important; }
      .manage-button { display:block !important; width:100% !important; box-sizing:border-box !important; text-align:center !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;background:${c.background};font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;color:${c.text};">
  <div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:${c.background};">
    <tr><td align="center" style="padding:28px 12px;">
      <table role="presentation" class="email-shell" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background:${c.card};border:1px solid ${c.border};border-radius:20px;overflow:hidden;">
        <tr>
          <td class="email-pad" style="padding:24px 34px;border-bottom:1px solid ${c.border};">
            <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
              <tr>
                <td width="44" valign="middle"><img src="${escapeHtml(THEOUTHAVEN_BRAND.logoUrl)}" width="40" height="40" alt="TheOutHaven" style="display:block;border:0;width:40px;height:40px;object-fit:contain;" /></td>
                <td valign="middle" style="padding-left:12px;color:${c.text};font-size:16px;line-height:20px;font-weight:800;">TheOutHaven<br/><span style="color:${c.subtle};font-size:12px;font-weight:600;">Reservations</span></td>
                <td align="right" valign="middle"><span style="display:inline-block;padding:7px 11px;border-radius:999px;background:${badgeBackground};color:${badgeText};font-size:11px;line-height:14px;font-weight:800;letter-spacing:.04em;">${copy.badge}</span></td>
              </tr>
            </table>
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:34px 34px 18px;">
            <div class="location-title" style="color:${c.text};font-size:30px;line-height:36px;font-weight:850;letter-spacing:-.025em;">${escapeHtml(locationName)}</div>
            <h1 class="hero-title" style="margin:10px 0 10px;color:${c.muted};font-size:22px;line-height:28px;font-weight:750;letter-spacing:-.01em;">${escapeHtml(copy.heading)}</h1>
            <p style="margin:0;color:${c.muted};font-size:16px;line-height:25px;">${input.customerName ? `Hi ${escapeHtml(input.customerName)}. ` : ""}${escapeHtml(copy.intro)}</p>
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:12px 34px 10px;">
            <div style="background:${c.elevated};border:1px solid ${c.border};border-radius:16px;padding:4px 18px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${detailRow("Date", displayDate)}
                ${detailRow("Time", displayTime)}
                ${detailRow("Party", `${partySize} guest${partySize === 1 ? "" : "s"}`)}
                ${input.confirmationCode ? detailRow("Confirmation", String(input.confirmationCode), true) : detailRow("Location", locationName, true)}
              </table>
            </div>
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:18px 34px 30px;">
            <a class="manage-button" href="${escapeHtml(ctaUrl)}" style="display:inline-block;background:${c.accent};color:#fff;text-decoration:none;border-radius:10px;padding:14px 22px;font-size:15px;line-height:20px;font-weight:800;">${escapeHtml(copy.cta)}</a>
            <p style="margin:14px 0 0;color:${c.subtle};font-size:13px;line-height:20px;">${escapeHtml(copy.footer)}</p>
          </td>
        </tr>
        <tr>
          <td class="email-pad" style="padding:20px 34px 24px;border-top:1px solid ${c.border};background:#100d0c;">
            <p style="margin:0;color:${c.muted};font-size:12px;line-height:19px;">Questions about this booking? Reply to this email and our reservations team can help.</p>
            <p style="margin:10px 0 0;color:${c.subtle};font-size:11px;line-height:17px;">TheOutHaven.com · Transactional reservation email</p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = [
    locationName,
    copy.heading,
    `${displayDate} at ${displayTime}`,
    `${partySize} guest${partySize === 1 ? "" : "s"}`,
    input.confirmationCode ? `Confirmation: ${input.confirmationCode}` : "",
    `${copy.cta}: ${ctaUrl}`,
  ].filter(Boolean).join("\n");

  return {
    subject: copy.subject(locationName),
    preview,
    html,
    text,
    department: "reservations",
    senderKey: "reservations",
    variant: "reservation",
    recipientType: "user",
  };
}
