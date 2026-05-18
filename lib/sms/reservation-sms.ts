import twilio from "twilio";

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

async function sendSms(to: string | null | undefined, body: string) {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_FROM_PHONE || process.env.TWILIO_PHONE_NUMBER;
  if (!sid || !token || !from || !to) return { status: "skipped" };
  const client = twilio(sid, token);
  return client.messages.create({ from, to, body });
}

export function sendReservationConfirmationSMS(input: ReservationSmsInput) {
  return sendSms(input.to, `Your reservation at ${input.locationName} is confirmed for ${input.reservationDate} at ${formatTime(input.reservationTime)}.`);
}

export function sendReservationCancelledSMS(input: ReservationSmsInput) {
  return sendSms(input.to, `Your reservation at ${input.locationName} for ${input.reservationDate} at ${formatTime(input.reservationTime)} has been cancelled.`);
}

export function sendReservationReminderSMS(input: ReservationSmsInput) {
  return sendSms(input.to, `Reminder: your reservation at ${input.locationName} is coming up ${input.reservationDate ? `on ${input.reservationDate}` : ""} at ${formatTime(input.reservationTime)}.`);
}

export function sendWaitlistSMS(input: ReservationSmsInput) {
  return sendSms(input.to, `A waitlist spot opened at ${input.locationName} for ${input.reservationDate} at ${formatTime(input.reservationTime)}. Book soon.`);
}
