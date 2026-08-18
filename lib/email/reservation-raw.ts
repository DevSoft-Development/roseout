import { renderBrandedEmail } from "./render";
import { THEOUTHAVEN_BRAND } from "./brand";
import type { EmailSection, RenderedEmail } from "./types";

const site = "https://theouthaven.com";
const fieldBoundary = String.raw`(?=\s+(?:Status|Date|Time|Party Size|Reserved|Item|Phone|Email|Request):|\s+View \/ Manage Reservation|\s+Open Reserve Portal|$)`;

function match(body: string, label: string) {
  const escapedLabel = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`${escapedLabel}:\\s*(.*?)${fieldBoundary}`, "i");
  return body.match(pattern)?.[1]?.trim() || "";
}

function cleanIntro(body: string) {
  return body
    .replace(/^TheOutHaven Reserve\s*/i, "")
    .replace(/^New TheOutHaven Reservation\s*/i, "")
    .split(/\s+(?:Status|Date):/i)[0]
    .trim();
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function locationNameFromSubject(subject: string) {
  return subject.match(/^Your\s+(.+?)\s+reservation:?$/i)?.[1]?.trim() || "Your reservation";
}

function customerNameFromBody(body: string) {
  return body.match(/\bHi\s+([^,]+),/i)?.[1]?.trim() || "";
}

function formatReservationDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return value;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

function looksLikeRestaurantSeating(value: string) {
  return /\bSeat\s+\d+\b/i.test(value) || /\b(?:bar seats?|booth|table|counter|high[- ]?top|patio seating|outdoor seating|indoor seating)\b/i.test(value);
}

function seatingPreference(value: string) {
  const choices = value
    .split(",")
    .map((part) => part.replace(/\s+Seat\s+\d+\b/gi, "").trim())
    .filter(Boolean);
  return [...new Set(choices)].join(", ") || value;
}

function renderCustomerReservationEmail(params: {
  subject: string;
  body: string;
  date: string;
  time: string;
  partySize: string;
  reserved: string;
  request: string;
  pending: boolean;
}): RenderedEmail {
  const c = THEOUTHAVEN_BRAND.colors;
  const locationName = locationNameFromSubject(params.subject);
  const customerName = customerNameFromBody(params.body);
  const displayDate = formatReservationDate(params.date);
  const statusLabel = params.pending ? "PENDING CONFIRMATION" : "CONFIRMED";
  const heading = params.pending ? "Reservation request received" : "Reservation confirmed";
  const preview = params.pending
    ? `${locationName} · ${displayDate} · ${params.time}`
    : `You’re booked at ${locationName} · ${displayDate} · ${params.time}`;
  const manageUrl = `${site}/reservations`;
  const logoUrl = THEOUTHAVEN_BRAND.logoUrl;
  const restaurantSeating = Boolean(params.reserved && looksLikeRestaurantSeating(params.reserved));
  const reservedLabel = restaurantSeating ? "Seating preference" : "Reserved space";
  const reservedValue = restaurantSeating
    ? `${seatingPreference(params.reserved)} · ${params.partySize} seats`
    : params.reserved;

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
                <td width="44" valign="middle"><img src="${escapeHtml(logoUrl)}" width="40" height="40" alt="TheOutHaven" style="display:block;border:0;width:40px;height:40px;object-fit:contain;" /></td>
                <td valign="middle" style="padding-left:12px;color:${c.text};font-size:16px;line-height:20px;font-weight:800;">TheOutHaven<br/><span style="color:${c.subtle};font-size:12px;font-weight:600;">Reservations</span></td>
                <td align="right" valign="middle"><span style="display:inline-block;padding:7px 11px;border-radius:999px;background:${params.pending ? "#3a2b10" : "#17351f"};color:${params.pending ? "#f5c76b" : "#70df8b"};font-size:11px;line-height:14px;font-weight:800;letter-spacing:.04em;">${statusLabel}</span></td>
              </tr>
            </table>
          </td>
        </tr>

        <tr>
          <td class="email-pad" style="padding:34px 34px 18px;">
            <div class="location-title" style="color:${c.text};font-size:30px;line-height:36px;font-weight:850;letter-spacing:-.025em;">${escapeHtml(locationName)}</div>
            <h1 class="hero-title" style="margin:10px 0 10px;color:${c.muted};font-size:22px;line-height:28px;font-weight:750;letter-spacing:-.01em;">${escapeHtml(heading)}</h1>
            <p style="margin:0;color:${c.muted};font-size:16px;line-height:25px;">${customerName ? `Hi ${escapeHtml(customerName)}. ` : ""}${params.pending ? "We’ve received your request and will keep you updated." : "Your booking is set. Everything you need is below."}</p>
          </td>
        </tr>

        <tr>
          <td class="email-pad" style="padding:12px 34px 10px;">
            <div style="background:${c.elevated};border:1px solid ${c.border};border-radius:16px;padding:4px 18px;">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                ${detailRow("Date", displayDate)}
                ${detailRow("Time", params.time)}
                ${detailRow("Party", `${params.partySize} guests`)}
                ${params.reserved ? detailRow(reservedLabel, reservedValue, true) : detailRow("Location", locationName, true)}
              </table>
            </div>
          </td>
        </tr>

        ${params.request ? `<tr><td class="email-pad" style="padding:10px 34px;"><div style="padding:14px 16px;border-radius:14px;background:${c.softRed};"><div style="color:${c.subtle};font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.08em;">Special request</div><div style="margin-top:5px;color:${c.text};font-size:14px;line-height:21px;">${escapeHtml(params.request)}</div></div></td></tr>` : ""}

        <tr>
          <td class="email-pad" style="padding:18px 34px 30px;">
            <a class="manage-button" href="${escapeHtml(manageUrl)}" style="display:inline-block;background:${c.accent};color:#fff;text-decoration:none;border-radius:10px;padding:14px 22px;font-size:15px;line-height:20px;font-weight:800;">Manage reservation</a>
            <p style="margin:14px 0 0;color:${c.subtle};font-size:13px;line-height:20px;">View, reschedule, or cancel this booking in TheOutHaven.</p>
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
    heading,
    `${displayDate} at ${params.time}`,
    `${params.partySize} guests${params.reserved ? ` · ${reservedLabel}: ${reservedValue}` : ""}`,
    params.request ? `Special request: ${params.request}` : "",
    `Manage reservation: ${manageUrl}`,
  ].filter(Boolean).join("\n");

  return {
    subject: params.subject,
    preview,
    html,
    text,
    department: "reservations",
    senderKey: "reservations",
    variant: "reservation",
    recipientType: "user",
  };
}

export function renderStructuredReservationRawEmail(params: {
  subject: string;
  body: string;
}): RenderedEmail | null {
  const body = String(params.body || "").replace(/\s+/g, " ").trim();
  const isCustomer = /^TheOutHaven Reserve\b/i.test(body);
  const isOwner = /^New TheOutHaven Reservation\b/i.test(body);

  if (!isCustomer && !isOwner) return null;

  const date = match(body, "Date");
  const time = match(body, "Time");
  const partySize = match(body, "Party Size");
  const reserved = match(body, isOwner ? "Item" : "Reserved");
  const status = match(body, "Status");
  const phone = match(body, "Phone");
  const email = match(body, "Email");
  const request = match(body, "Request");

  if (!date || !time || !partySize) return null;

  const pending = isCustomer && /pending confirmation/i.test(body);

  if (isCustomer) {
    return renderCustomerReservationEmail({
      subject: params.subject,
      body,
      date,
      time,
      partySize,
      reserved,
      request,
      pending,
    });
  }

  const sections: EmailSection[] = [
    {
      type: "badgeRow",
      badges: [
        {
          label: `NEW RESERVATION${status ? ` · ${status.toUpperCase()}` : ""}`,
          tone: "info",
        },
      ],
    },
    {
      type: "keyValueGrid",
      title: "Reservation details",
      items: [
        { label: "Date", value: date },
        { label: "Time", value: time },
        { label: "Party", value: `${partySize} guests` },
        ...(reserved ? [{ label: "Reserved item", value: reserved }] : []),
      ],
    },
  ];

  if (email || phone || request) {
    sections.push({
      type: "customerCard",
      email: email || undefined,
      phone: phone || undefined,
      notes: request || undefined,
    });
  }

  return renderBrandedEmail({
    templateKey: "reservation_created_owner_raw",
    senderKey: "business_owner",
    department: "reservations",
    recipientType: "location_owner",
    variant: "reservation",
    subject: params.subject,
    preview: `New reservation: ${date} at ${time}`,
    eyebrow: "THEOUTHAVEN RESERVE",
    heading: "New reservation received",
    intro: cleanIntro(body),
    sections,
    primaryCta: {
      label: "Open Reserve Portal",
      url: `${site}/reserve/dashboard/reservations`,
    },
    footerNote: "This is an operational reservation notification from TheOutHaven.",
  });
}
