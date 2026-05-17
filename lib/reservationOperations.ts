import twilio from "twilio";
import { supabaseAdmin } from "@/lib/supabase-admin";

export const ACTIVE_RESERVATION_STATUSES = [
  "confirmed",
  "arrived",
  "seated",
  "occupied",
];

export const LAYOUT_ITEM_STATUSES = [
  "available",
  "reserved",
  "occupied",
  "cleaning",
  "blocked",
  "maintenance",
] as const;

export const RESERVATION_SMS_TYPES = [
  "reservation_confirmed",
  "reminder_24h",
  "reminder_2h",
  "reservation_cancelled",
  "item_ready",
  "waitlist_joined",
  "waitlist_ready",
] as const;

export function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

export function normalizeReservationType(value: unknown) {
  const type = cleanString(value).toLowerCase();
  if (["activity", "activities"].includes(type)) return "activity";
  if (["bar", "bars"].includes(type)) return "bar";
  if (["lounge", "lounges"].includes(type)) return "lounge";
  if (["venue", "venues"].includes(type)) return "venue";
  return "restaurant";
}

export function timeToMinutes(value: string) {
  const [hourRaw, minuteRaw = "0"] = String(value || "00:00").slice(0, 5).split(":");
  return Number(hourRaw) * 60 + Number(minuteRaw);
}

export function rangesOverlap(
  startA: string,
  durationA: number,
  startB: string,
  durationB: number,
) {
  const aStart = timeToMinutes(startA);
  const aEnd = aStart + durationA;
  const bStart = timeToMinutes(startB);
  const bEnd = bStart + durationB;
  return aStart < bEnd && aEnd > bStart;
}

export function buildIcsText({
  title,
  description,
  location,
  startsAt,
  durationMinutes,
}: {
  title: string;
  description: string;
  location: string;
  startsAt: Date;
  durationMinutes: number;
}) {
  const stamp = formatIcsDate(new Date());
  const start = formatIcsDate(startsAt);
  const end = formatIcsDate(new Date(startsAt.getTime() + durationMinutes * 60_000));
  const escape = (value: string) =>
    String(value || "")
      .replaceAll("\\", "\\\\")
      .replaceAll(";", "\\;")
      .replaceAll(",", "\\,")
      .replaceAll("\n", "\\n");

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//TheOutHaven//Reserve//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${crypto.randomUUID()}@theouthaven.com`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escape(title)}`,
    `DESCRIPTION:${escape(description)}`,
    `LOCATION:${escape(location)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
}

function formatIcsDate(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

export async function tableExistsFallback<T>(primary: () => Promise<T>, fallback: () => Promise<T>) {
  try {
    return await primary();
  } catch (error) {
    return await fallback();
  }
}

export async function logStaffActivity(input: {
  locationId?: string | null;
  reservationId?: string | null;
  action: string;
  details?: Record<string, unknown>;
}) {
  await supabaseAdmin.from("reservation_activity_logs").insert({
    location_id: input.locationId || null,
    reservation_id: input.reservationId || null,
    action: input.action,
    details: input.details || {},
  });
}

export async function sendReservationSms(input: {
  locationId?: string | null;
  reservationId?: string | null;
  to?: string | null;
  messageType: string;
  body: string;
}) {
  const to = cleanString(input.to);
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_PHONE || process.env.TWILIO_PHONE_NUMBER;
  const logBase = {
    location_id: input.locationId || null,
    reservation_id: input.reservationId || null,
    customer_phone: to || null,
    message_type: input.messageType,
    message_body: input.body,
    provider: "twilio",
  };

  if (!to || !sid || !token || !from) {
    await supabaseAdmin.from("sms_logs").insert({
      ...logBase,
      status: "skipped",
      error_message: !to ? "Missing customer phone." : "Twilio is not configured.",
    });
    return { status: "skipped" };
  }

  try {
    const client = twilio(sid, token);
    const result = await client.messages.create({
      from,
      to,
      body: `${input.body}\n\nReply STOP to opt out, HELP for help, or CANCEL to cancel.`,
    });

    await supabaseAdmin.from("sms_logs").insert({
      ...logBase,
      provider_message_id: result.sid,
      status: result.status || "queued",
      sent_at: new Date().toISOString(),
    });

    return { status: result.status, sid: result.sid };
  } catch (error) {
    const message = error instanceof Error ? error.message : "SMS failed.";
    await supabaseAdmin.from("sms_logs").insert({
      ...logBase,
      status: "failed",
      error_message: message,
    });
    return { status: "failed", error: message };
  }
}
