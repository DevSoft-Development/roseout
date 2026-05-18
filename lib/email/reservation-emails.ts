import { Resend } from "resend";

export type ReservationEmailInput = {
  to?: string | null;
  locationName: string;
  reservationDate: string;
  reservationTime: string;
  partySize?: number | null;
  confirmationCode?: string | null;
  modifyUrl?: string;
  cancelUrl?: string;
};

function getClient() {
  return process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
}

function formatTime(value: string) {
  const [hourRaw, minuteRaw = "00"] = String(value || "00:00").slice(0, 5).split(":");
  const hour = Number(hourRaw);
  const suffix = hour >= 12 ? "PM" : "AM";
  return `${hour % 12 || 12}:${minuteRaw.padStart(2, "0")} ${suffix}`;
}

function template(title: string, intro: string, input: ReservationEmailInput) {
  return `
    <div style="margin:0;background:#1b1210;padding:28px;font-family:Arial,sans-serif;color:#1b1210;">
      <div style="max-width:640px;margin:0 auto;border-radius:28px;background:#fff7ed;overflow:hidden;border:1px solid #fecdd3;">
        <div style="background:linear-gradient(135deg,#f43f5e,#9f1239);padding:28px;color:white;">
          <p style="margin:0;text-transform:uppercase;letter-spacing:.25em;font-size:12px;font-weight:900;">TheOutHaven Reserve</p>
          <h1 style="margin:10px 0 0;font-size:30px;line-height:1.1;">${title}</h1>
        </div>
        <div style="padding:28px;line-height:1.6;">
          <p style="font-size:16px;margin-top:0;">${intro}</p>
          <div style="border-radius:20px;background:white;padding:18px;border:1px solid #fed7aa;">
            <p><strong>Location:</strong> ${input.locationName}</p>
            <p><strong>Date:</strong> ${input.reservationDate}</p>
            <p><strong>Time:</strong> ${formatTime(input.reservationTime)}</p>
            <p><strong>Party size:</strong> ${input.partySize || 2}</p>
            ${input.confirmationCode ? `<p><strong>Confirmation code:</strong> ${input.confirmationCode}</p>` : ""}
          </div>
          <p style="margin:24px 0 0;">
            ${input.modifyUrl ? `<a href="${input.modifyUrl}" style="display:inline-block;background:#111827;color:white;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:800;margin-right:8px;">View / Modify</a>` : ""}
            ${input.cancelUrl ? `<a href="${input.cancelUrl}" style="display:inline-block;background:#e11d48;color:white;text-decoration:none;border-radius:999px;padding:12px 18px;font-weight:800;">Cancel</a>` : ""}
          </p>
          <p style="color:#7c2d12;font-size:13px;margin-top:24px;">Thank you for planning your outing with TheOutHaven.</p>
        </div>
      </div>
    </div>`;
}

async function send(to: string | null | undefined, subject: string, html: string) {
  const client = getClient();
  if (!client || !to) return { status: "skipped" };
  return client.emails.send({
    from: process.env.RESERVE_FROM_EMAIL || "TheOutHaven Reserve <hello@theouthaven.com>",
    to,
    subject,
    html,
  });
}

export function sendReservationConfirmationEmail(input: ReservationEmailInput) {
  return send(input.to, `Reservation confirmed at ${input.locationName}`, template("Your reservation is confirmed", "Your booking is all set. Here are your reservation details.", input));
}

export function sendReservationCancelledEmail(input: ReservationEmailInput) {
  return send(input.to, `Reservation cancelled at ${input.locationName}`, template("Reservation cancelled", "Your reservation has been cancelled. The slot has been released.", input));
}

export function sendReservationReminderEmail(input: ReservationEmailInput) {
  return send(input.to, `Reservation reminder for ${input.locationName}`, template("Your reservation is coming up", "A quick reminder for your upcoming TheOutHaven reservation.", input));
}

export function sendWaitlistAvailableEmail(input: ReservationEmailInput) {
  return send(input.to, `A reservation opened at ${input.locationName}`, template("A spot just opened", "Good news — a matching reservation slot opened. Book soon before it is released.", input));
}
