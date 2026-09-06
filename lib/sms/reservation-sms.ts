import { sendSms as sendAppSms } from "@/lib/sms/sendSms";

export type ReservationSmsInput = {
  to?: string | null;
  locationName: string;
  reservationDate?: string;
  reservationTime?: string;
};

function formatTime(value?: string) {
  const [hourRaw, minuteRaw = "00"] = String(value || "00:00").slice(0, 5).split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minuteRaw.padStart(2, "0")} ${suffix}`;
}

function formatDate(value?: string) {
  const raw = String(value || "").trim();
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : raw;
}

async function sendSms(to: string | null | undefined, body: string) {
  if (!to) return { status: "skipped" };
  return sendAppSms({ to, body });
}

const controls = " You can manage this by text — just tell us naturally if you want to reschedule, change the date/time or guest count, review details, or cancel. Reply HELP for options.";

export function sendReservationConfirmationSMS(input: ReservationSmsInput) {
  return sendSms(input.to, `Your reservation at ${input.locationName} is confirmed for ${formatDate(input.reservationDate)} at ${formatTime(input.reservationTime)}.${controls}`);
}

export function sendReservationCancelledSMS(input: ReservationSmsInput) {
  return sendSms(input.to, `Your reservation at ${input.locationName} for ${formatDate(input.reservationDate)} at ${formatTime(input.reservationTime)} has been cancelled.`);
}

export function sendReservationReminderSMS(input: ReservationSmsInput) {
  return sendSms(input.to, `Reminder: your reservation at ${input.locationName} is coming up ${input.reservationDate ? `on ${formatDate(input.reservationDate)}` : ""} at ${formatTime(input.reservationTime)}.${controls}`);
}

export function sendWaitlistSMS(input: ReservationSmsInput) {
  return sendSms(input.to, `A waitlist spot opened at ${input.locationName} for ${formatDate(input.reservationDate)} at ${formatTime(input.reservationTime)}. Book soon.`);
}
