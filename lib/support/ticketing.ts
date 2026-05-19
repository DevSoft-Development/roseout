export const SUPPORT_EMAIL_FROM = process.env.SUPPORT_EMAIL_FROM || "support@theouthaven.com";

export const DEFAULT_SUPPORT_TICKET_STATUSES = ["open", "pending", "waiting_on_customer", "resolved", "closed"] as const;
export const DEFAULT_SUPPORT_TICKET_PRIORITIES = ["low", "normal", "high", "urgent"] as const;

export function normalizeSubject(input: string | null | undefined) {
  return (input || "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/^re:\s*/g, "")
    .replace(/\s*[-—–]\s*ticket\s*#\w+/gi, "")
    .trim();
}

export function extractTicketNumber(subject: string | null | undefined) {
  const value = subject || "";
  const match = value.match(/ticket\s*#([a-z0-9-]+)/i);
  return match?.[1]?.toUpperCase() || null;
}

export function buildSupportAutoReplyBody(name: string | null | undefined, ticketNumber: string, subject: string) {
  const safeName = name?.trim() || "there";
  return `Hi ${safeName},\n\nThanks for contacting TheOutHaven Support. We received your message and created support ticket #${ticketNumber}.\n\nOur team will review it and reply as soon as possible.\n\nTicket subject:\n${subject}\n\nYou can reply directly to this email to add more information to your ticket.\n\nTheOutHaven Support\nsupport@theouthaven.com`;
}

export function buildReplySubject(subject: string, ticketNumber: string) {
  return `Re: ${subject} — Ticket #${ticketNumber}`;
}
