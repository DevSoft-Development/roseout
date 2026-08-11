import { renderBrandedEmail } from "./render";
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
  const customerStatus = pending ? "PENDING CONFIRMATION" : "CONFIRMED";

  const sections: EmailSection[] = [
    {
      type: "badgeRow",
      badges: [
        {
          label: isOwner ? `NEW RESERVATION${status ? ` · ${status.toUpperCase()}` : ""}` : customerStatus,
          tone: isOwner ? "info" : pending ? "warning" : "success",
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
        ...(reserved ? [{ label: isOwner ? "Reserved item" : "Reservation", value: reserved }] : []),
      ],
    },
  ];

  if (isOwner && (email || phone || request)) {
    sections.push({
      type: "customerCard",
      email: email || undefined,
      phone: phone || undefined,
      notes: request || undefined,
    });
  } else if (request) {
    sections.push({
      type: "callout",
      title: "Special request",
      text: request,
      tone: "info",
    });
  }

  if (isCustomer) {
    sections.push({
      type: "callout",
      title: "Before you go",
      text: "Review your reservation details before arrival. Changes remain subject to availability.",
      tone: "info",
    });
  }

  return renderBrandedEmail({
    templateKey: isOwner ? "reservation_created_owner_raw" : "reservation_created_customer_raw",
    senderKey: isOwner ? "business_owner" : "reservations",
    department: "reservations",
    recipientType: isOwner ? "location_owner" : "user",
    variant: "reservation",
    subject: params.subject,
    preview: isOwner
      ? `New reservation: ${date} at ${time}`
      : pending
        ? `Reservation request received for ${date} at ${time}`
        : `You’re booked for ${date} at ${time}`,
    eyebrow: isOwner ? "THEOUTHAVEN RESERVE" : customerStatus,
    heading: isOwner ? "New reservation received" : pending ? "Request received." : "You’re booked.",
    intro: cleanIntro(body),
    sections,
    primaryCta: {
      label: isOwner ? "Open Reserve Portal" : "View Reservations",
      url: isOwner ? `${site}/reserve/dashboard/reservations` : `${site}/reservations`,
    },
    footerNote: isCustomer
      ? "You received this transactional email because a reservation was created using this email address."
      : "This is an operational reservation notification from TheOutHaven.",
  });
}
